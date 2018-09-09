pragma solidity ^0.4.24;


/// @title Contract which allows multiple benefactors to mutually control the fund and
///        allow spending of funds to different beneficiaries. Note that this is not
///        production-level contract as it has a lot of holes and assumes mutual trust
///        between the benefactors
/// @author Janko Krstic <keichiri@protonmail.com>
contract MultibenefactorAllowanceFund {
    address[] public benefactors;
    uint public maximumAllowance;
    uint allowanceCounter;
    uint[] activeAllowances;
    mapping (uint => Allowance) allowances;

    struct Allowance {
        uint id;
        uint total;
        uint spent;
        address beneficiary;
        uint requiredApprovals;
        address[] approvers;
    }


    event AllowanceCreated(uint indexed id, address indexed beneficiary, uint allowed, uint requiredApprovals);
    event AllowanceApproved(uint indexed id, address indexed beneficiary, address approver);
    event AllowanceUnlocked(uint indexed id, address indexed beneficiary);

    modifier onlyBenefactor() {
        bool isBenefactor = false;
        for (uint i = 0; i < benefactors.length; i++) {
            if (benefactors[i] == msg.sender) {
                isBenefactor = true;
                break;
            }
        }

        require(isBenefactor, "Must be called by benefactor");

        _;
    }

    modifier isActiveAllowance(uint _allowanceID) {
        bool isActive = false;
        for (uint i = 0; i < activeAllowances.length; i++) {
            if (activeAllowances[i] == _allowanceID) {
                isActive = true;
                break;
            }
        }

        require(isActive, "Allowance must be active");

        _;
    }


    /// @notice Constructor which sets the initial list of benefactors
    /// @param _benefactors List of benefactors that will control the fund
    /// @param _maximumAllowance The allowance cap for all allowances
    constructor(address[] _benefactors, uint _maximumAllowance) public {
        require(_maximumAllowance > 0, "Allowance maximum must be greater than zero");

        maximumAllowance = _maximumAllowance;
        benefactors = _benefactors;
    }

    /// @notice The fallback payable function which is used for funding this fund contract
    function () public onlyBenefactor payable {}

    /// @dev Creates allowance for provided beneficiary
    /// @param _allowed The amount of funds allowed
    /// @param _beneficiary The receiver of funds
    /// @param _requiredApprovals The number of benefactors that must approve
    function createAllowance(uint _allowed, address _beneficiary, uint _requiredApprovals) public onlyBenefactor {
        require(_allowed <= maximumAllowance, "Allowed amount cannot exceed maximum allowance");
        require(_beneficiary != address(0), "Beneficiary cannot be zero account");

        allowanceCounter++;

        activeAllowances.push(allowanceCounter);
        allowances[allowanceCounter].id = allowanceCounter;
        allowances[allowanceCounter].total = _allowed;
        allowances[allowanceCounter].beneficiary = _beneficiary;
        allowances[allowanceCounter].requiredApprovals = _requiredApprovals;
        allowances[allowanceCounter].approvers.push(msg.sender);

        emit AllowanceCreated(allowanceCounter, _beneficiary, _allowed, _requiredApprovals);
    }

    /// @notice Approves allowance for spending
    /// @dev Can be approved even after it is unlocked. It is allowed.
    /// @param _allowanceID The allowance that is to be approved
    function approveAllowance(uint _allowanceID) public onlyBenefactor isActiveAllowance(_allowanceID) {
        bool alreadyApproved = false;
        Allowance storage allowance = allowances[_allowanceID];
        for (uint i = 0; i < allowance.approvers.length; i++) {
            if (allowance.approvers[i] == msg.sender) {
                alreadyApproved = true;
                break;
            }
        }

        require(!alreadyApproved, "Cannot approve allowance more than once");

        emit AllowanceApproved(_allowanceID, allowance.beneficiary, msg.sender);
        allowances[_allowanceID].approvers.push(msg.sender);

        if (allowance.approvers.length == allowance.requiredApprovals) {
            emit AllowanceUnlocked(_allowanceID, allowance.beneficiary);
        }
    }

    ///@return List of all current benefactors
    function getBenefactors() public view returns (address[]) {
        return benefactors;
    }


    /// @return Number of currently active (unspent) allowances
    function allowancesCount() public view returns (uint) {
        return activeAllowances.length;
    }

    /// @return Allowance data for allowance with provided id
    function getAllowanceForId(uint _id) public view returns (uint, uint, address, uint, address[]) {
        return (
            allowances[_id].total,
            allowances[_id].spent,
            allowances[_id].beneficiary,
            allowances[_id].requiredApprovals,
            allowances[_id].approvers
        );
    }
}
