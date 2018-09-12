const MultibenefactorAllowanceFund = artifacts.require("./MultibenefactorAllowanceFund.sol");
const { retrieveEvent, assertRevert } = require("./helpers.js");


async function weiGasCost(tx) {
    let actualTx = await web3.eth.getTransaction(tx.tx);
    let gasUsed = web3.toBigNumber(tx.receipt.gasUsed);
    let gasPrice = actualTx.gasPrice;

    return gasUsed.mul(gasPrice);
}

contract("MultibenefactorAllowanceFund", accounts => {
    let fund;
    let benefactor1 = accounts[0];
    let benefactor2 = accounts[1];
    let benefactor3 = accounts[2];
    let benefactor4 = accounts[3];
    let beneficiary1 = accounts[4];
    let beneficiary2 = accounts[5];
    let benefactors = [benefactor1, benefactor2, benefactor3, benefactor4];
    let allowedAmount = web3.toWei(5, 'ether');
    let maximumAllowance = web3.toWei(10, 'ether');

    beforeEach(async() => {
        fund = await MultibenefactorAllowanceFund.new(benefactors, maximumAllowance);
        assert.ok(fund);
    })

    describe("Constructor", () => {
        it("sets initial benefactors and maximum allowance", async() => {
            let retrievedBenefactors = await fund.getBenefactors();
            let retrievedMaximumAllowance = await fund.maximumAllowance();

            assert.deepEqual(retrievedBenefactors, benefactors);
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

            let allowance = await fund.getAllowance(1);

            assert.equal(allowance[0], allowedAmount);
            assert.equal(allowance[1], 0);
            assert.equal(allowance[2], beneficiary1);
            assert.equal(allowance[3], 3);
            assert.isFalse(allowance[4]);
            assert.deepEqual(allowance[5], [benefactor1]);
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

            let allowance = await fund.getAllowance(1);

            assert.deepEqual(allowance[5], [benefactor1, benefactor2]);
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

    describe("Funding", () => {
        let funding = web3.toWei("1", "ether");

        it("Accepts funds from benefactor", async() => {
            let initialBalance = await web3.eth.getBalance(fund.address);

            await fund.sendTransaction({from: benefactor3, value: funding});

            let currentBalance = await web3.eth.getBalance(fund.address);

            assert.equal(currentBalance.toNumber(), initialBalance + funding);
        })

        it("Does not accept funds from non-benefactors", async() => {
            await assertRevert(fund.sendTransaction({from: beneficiary2, value: funding}));
        })
    })

    describe("Withdrawing", () => {
        let withdrawnAmount = web3.toWei("2", "ether");
        let funding = web3.toWei("20", "ether");

        beforeEach(async() => {
            let tx = await fund.createAllowance(allowedAmount, beneficiary1, 3, {from: benefactor1});
            assert.ok(tx);
            await fund.approveAllowance(1, {from: benefactor2});
            await fund.approveAllowance(1, {from: benefactor3});
            await fund.sendTransaction({from: benefactor4, value: funding});
        })

        it("Sends money to beneficiary and correctly adjusts total", async() => {
            let initialBeneficiaryBalance = await web3.eth.getBalance(beneficiary1);
            let initialAllowanceState = await fund.getAllowance(1);

            let tx = await fund.withdrawAllowed(1, withdrawnAmount, {from: beneficiary1});
            let gasCost = await weiGasCost(tx);

            let currentBeneficiaryBalance = await web3.eth.getBalance(beneficiary1);
            let currentAllowanceState = await fund.getAllowance(1);

            assert.equal(currentBeneficiaryBalance.toNumber(), initialBeneficiaryBalance.add(withdrawnAmount).sub(gasCost).toNumber());
            assert.equal(initialAllowanceState[0].toNumber(), currentAllowanceState[0].toNumber());
            assert.equal(initialAllowanceState[1].toNumber() + withdrawnAmount, currentAllowanceState[1].toNumber());
        })

        it("Emits AllowanceConsumption event", async() => {
            let tx = await fund.withdrawAllowed(1, withdrawnAmount, {from: beneficiary1});

            let event = await retrieveEvent(tx, "AllowanceConsumption");

            assert.isDefined(event);
            assert.equal(event.args.id, 1);
            assert.equal(event.args.beneficiary, beneficiary1);
            assert.equal(event.args.withdrawn, withdrawnAmount);
            assert.equal(event.args.left, allowedAmount - withdrawnAmount);
        })

        it("Emits AllowanceSpent event if total amount is withdrawn", async() => {
            await fund.withdrawAllowed(1, withdrawnAmount, {from: beneficiary1});
            let tx = await fund.withdrawAllowed(1, allowedAmount - withdrawnAmount, {from: beneficiary1});
            let event = await retrieveEvent(tx, "AllowanceSpent");

            assert.isDefined(event);
            assert.equal(event.args.id, 1);
            assert.equal(event.args.beneficiary, beneficiary1);
        })

        it("Removes allowance from active allowances if it is spent", async() => {
            let initialActive = await fund.getActiveAllowances();

            await fund.withdrawAllowed(1, allowedAmount, {from: beneficiary1});
            let isActive = await fund.isAllowanceActive(1);

            let currentlyActive = await fund.getActiveAllowances();

            assert.equal(initialActive.length, 1);
            assert.equal(initialActive[0], 1);
            assert.deepEqual(currentlyActive.length, 0);
            assert.isFalse(isActive);
        })

        it("Cannot be withdrawn if not unlocked", async() => {
            let tx = await fund.createAllowance(allowedAmount, beneficiary1, 4, {from: benefactor2});
            let event = await retrieveEvent(tx, "AllowanceCreated");
            let id = event.args.id;
            await fund.approveAllowance(id, {from: benefactor1});
            await fund.approveAllowance(id, {from: benefactor3});

            await assertRevert(fund.withdrawAllowed(id, withdrawnAmount, {from: beneficiary1}));
        })

        it("Cannot be withdrawn if frozen", async() => {
            await fund.freezeAllowance(1, {from: benefactor1});

            await assertRevert(fund.withdrawAllowed(1, withdrawnAmount, {from: beneficiary1}));
        })

        it("Reverts if amount larger than left", async() => {
            await assertRevert(fund.withdrawAllowed(1, allowedAmount + 1, {from: beneficiary1}));
        })

        it("Cannot be spent by benefactor", async() => {
            let initialBenefactorBalance = web3.eth.getBalance(benefactor1);
            await assertRevert(fund.withdrawAllowed(1, withdrawnAmount, {from: benefactor1}));
        })

        it("Cannot be spent by beneficiary of other allowance", async() => {
            await fund.createAllowance(allowedAmount, beneficiary2, 3, {from: benefactor3});
            await assertRevert(fund.withdrawAllowed(1, withdrawnAmount, {from: beneficiary2}));
        })
    })

    describe("Freezing", () => {
        beforeEach(async() => {
            await fund.createAllowance(allowedAmount, beneficiary1, 2, {from: benefactor1});
        })

        it("Sets frozen field on Allowance to true", async() => {
            await fund.freezeAllowance(1, {from: benefactor1});
            let allowance = await fund.getAllowance(1);

            assert.isTrue(allowance[4]);
        })

        it("Emits AllowanceFreeze with frozen set to true", async() => {
            let tx = await fund.freezeAllowance(1, {from: benefactor1});
            let event = await retrieveEvent(tx, "AllowanceFreeze");
            assert.isDefined(event);

            assert.equal(event.args.beneficiary, beneficiary1);
            assert.isTrue(event.args.frozen);
            assert.equal(event.args.id, 1);
        })

        it("Reverts if sender not benefactor", async() => {
            await assertRevert(fund.freezeAllowance(1, {from: beneficiary1}));
        })

        it("Reverts if freezing already frozen allowance", async() => {
            await fund.freezeAllowance(1, {from: benefactor1});
            await assertRevert(fund.freezeAllowance(1, {from: benefactor1}));
        })

        it("Reverts if allowance does not exist", async() => {
            await assertRevert(fund.freezeAllowance(2, {from: benefactor1}));
        })

        it("Reverts if allowance spent", async() => {
            await fund.approveAllowance(1, {from: benefactor2});
            await fund.sendTransaction({from: benefactor3, value: allowedAmount});
            await fund.withdrawAllowed(1, allowedAmount, {from: beneficiary1});

            await assertRevert(fund.freezeAllowance(1, {from: benefactor3}));
        })
    })

    describe("Unfreezing", () => {
        beforeEach(async() => {
            let tx = await fund.createAllowance(allowedAmount, beneficiary1, 3, {from: benefactor1});
            let event = await retrieveEvent(tx, "AllowanceCreated");
            assert.equal(event.args.id, 1);

            await fund.sendTransaction({from: benefactor4, value: allowedAmount});
            await fund.approveAllowance(1, {from: benefactor2});
            await fund.approveAllowance(1, {from: benefactor3});
            await fund.freezeAllowance(1, {from: benefactor3});
        })

        it("Sets frozen field on Allowance to false", async() => {
            await fund.unfreezeAllowance(1, {from: benefactor2});
            let allowance = await fund.getAllowance(1);

            assert.isFalse(allowance[4]);
        })

        it("Emits AllowanceFreeze event with frozen set to false", async() => {
            let tx = await fund.unfreezeAllowance(1, {from: benefactor4});
            let event = await retrieveEvent(tx, "AllowanceFreeze");

            assert.equal(event.args.id, 1);
            assert.equal(event.args.beneficiary, beneficiary1);
            assert.isFalse(event.args.frozen);
        })

        it("Reverts if called by non-benefactor", async() => {
            await assertRevert(fund.unfreezeAllowance(1, {from: beneficiary1}));
        })

        it("Reverts if allowance is not frozen", async() => {
            await fund.unfreezeAllowance(1, {from: benefactor1});
            await assertRevert(fund.unfreezeAllowance(1, {from: benefactor1}));
        })

        it("Reverts if allowance does not exist", async() => {
            await assertRevert(fund.unfreezeAllowance(2, {from: benefactor1}));
        })
    })
})
