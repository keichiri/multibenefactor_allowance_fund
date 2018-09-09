const MultibenefactorAllowanceFund = artifacts.require("./MultibenefactorAllowanceFund.sol");
const { retrieveEvent, assertRevert } = require("./helpers.js");

contract("MultibenefactorAllowanceFund", accounts => {
    let fund;
    let benefactor1 = accounts[0];
    let benefactor2 = accounts[1];
    let benefactor3 = accounts[2];
    let benefactor4 = accounts[3];
    let beneficiary1 = accounts[4];
    let beneficiary2 = accounts[5];
    let allowedAmount = web3.toWei(5, 'ether');
    let maximumAllowance = web3.toWei(100, 'ether');

    beforeEach(async() => {
        fund = await MultibenefactorAllowanceFund.new([benefactor1, benefactor2, benefactor3, benefactor4], maximumAllowance);
        assert.ok(fund);
    })

    describe("constructor", () => {
        it("sets initial benefactors and maximum allowance", async() => {
            let retrievedBenefactors = await fund.getBenefactors();
            let retrievedMaximumAllowance = await fund.maximumAllowance();

            assert.deepEqual(retrievedBenefactors, [benefactor1, benefactor2, benefactor3, benefactor4]);
            assert.equal(maximumAllowance, retrievedMaximumAllowance);
        })

        it("does not allow maximumAllowance as zero", async() => {
            await assertRevert(MultibenefactorAllowanceFund.new([benefactor1], 0));
        })
    })

    describe("Allowance creation", () => {
        let requiredApprovals = 3;

        it("creates new allowance and returns its id", async() => {
            await fund.createAllowance(allowedAmount, beneficiary1, requiredApprovals, {from: benefactor1});

            let allowance = await fund.getAllowanceForId(1);

            assert.equal(allowance[0], allowedAmount);
            assert.equal(allowance[1], 0);
            assert.equal(allowance[2], beneficiary1);
            assert.equal(allowance[3], 3);
            assert.deepEqual(allowance[4], [benefactor1]);
        })

        it("creates appropriate event", async() => {
            let tx = await fund.createAllowance(allowedAmount, beneficiary1, requiredApprovals, {from: benefactor2});

            let event = await retrieveEvent(tx, "AllowanceCreated");
            assert.isDefined(event);
            assert.equal(event.args.id, 1);
            assert.equal(event.args.beneficiary, beneficiary1);
            assert.equal(event.args.allowed, allowedAmount);
            assert.equal(event.args.requiredApprovals, requiredApprovals);
        })

        it("increases count of active allowances", async() => {
            assert.equal(await fund.allowancesCount(), 0);
            await fund.createAllowance(allowedAmount, beneficiary1, requiredApprovals, {from: benefactor1});
            assert.equal(await fund.allowancesCount(), 1);
        })

        it("must be called by one of benefactors", async() => {
            await assertRevert(fund.createAllowance(allowedAmount, beneficiary1, requiredApprovals, {from: beneficiary2}));
        })

        it("cannot have zero account beneficiary", async() => {
            await assertRevert(fund.createAllowance(allowedAmount, "0x" + "0".repeat(40), requiredApprovals, {from: benefactor1}));
        })

        it("cannot have allowance more than maximum", async() => {
            await assertRevert(fund.createAllowance(maximumAllowance + 1, beneficiary1, requiredApprovals, {from: benefactor1}));
        })
    })

    describe("Allowance approval", () => {
        let requiredApprovals = 3;

        beforeEach(async() => {
            let tx = await fund.createAllowance(maximumAllowance, beneficiary1, requiredApprovals, {from: benefactor1});
            assert.ok(tx);
        })

        it("Adds sender address to approvers after approval", async() => {
            await fund.approveAllowance(1, {from: benefactor2});

            let allowance = await fund.getAllowanceForId(1);

            assert.deepEqual(allowance[4], [benefactor1, benefactor2]);
        })

        it("Creates AllowanceApproved event", async() => {
            let tx = await fund.approveAllowance(1, {from: benefactor2});
            let event = await retrieveEvent(tx, "AllowanceApproved");

            assert.ok(event);
        })

        it("Creates AllowanceUnlocked event when it has required number of approvals", async() => {
            let tx1 = await fund.approveAllowance(1, {from: benefactor2});
            let event1 = await retrieveEvent(tx1, "AllowanceUnlocked");
            assert.isUndefined(event1);

            let tx2 = await fund.approveAllowance(1, {from: benefactor3});
            let event2 = await retrieveEvent(tx2, "AllowanceUnlocked");
            assert.isDefined(event2);
            assert.equal(event2.args.id, 1);
            assert.equal(event2.args.beneficiary, beneficiary1);
        })

        it("Cannot be approved by non-benefactor", async() => {
            await assertRevert(fund.approveAllowance(1, {from: beneficiary2}));
        })

        it("Cannot be approved more than once by one approver", async() => {
            await assertRevert(fund.approveAllowance(1, {from: benefactor1}));
        })

        it("Reverts if approving nonactive allowance", async() => {
            await assertRevert(fund.approveAllowance(2, {from: benefactor1}));
        })
    })
})
