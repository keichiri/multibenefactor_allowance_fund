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
    event AllowanceConsumption(uint indexed id, address indexed beneficiary, uint withdrawn, uint left);
    event AllowanceSpent(uint indexed id, address indexed beneficiary);


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


    /// @notice Withdraws funds from the allowance
    /// @param _allowanceID The allowance that is have money withdrawn from
    /// @param _amount The amount that is withdrawn
    function withdrawAllowed(uint _allowanceID, uint _amount) public isActiveAllowance(_allowanceID) {
        Allowance storage allowance = allowances[_allowanceID];
        require(allowance.approvers.length >= allowance.requiredApprovals, "Must be approved by required number of approvers");
        require(allowance.beneficiary == msg.sender, "Only beneficiary can withdraw");
        require(allowance.total - allowance.spent >= _amount, "Not enough funds in allowance");

        allowance.spent += _amount;
        emit AllowanceConsumption(_allowanceID, allowance.beneficiary, _amount, allowance.total - allowance.spent);
        if (allowance.spent == allowance.total) {
            emit AllowanceSpent(_allowanceID, allowance.beneficiary);
            removeAllowance(_allowanceID);
        }

        msg.sender.transfer(_amount);
    }

    function removeAllowance(uint _allowanceID) internal {
        uint index;
        for (uint i = 0; i < activeAllowances.length; i++) {
            if (activeAllowances[i] == _allowanceID) {
                index = i;
                break;
            }
        }

        for (uint i2 = index; i2 < activeAllowances.length - 1; i2++) {
            activeAllowances[i2] = activeAllowances[i2+1];
        }

        delete activeAllowances[activeAllowances.length-1];
        activeAllowances.length--;
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
    function getAllowance(uint _allowanceID) public view returns (uint, uint, address, uint, address[]) {
        return (
            allowances[_allowanceID].total,
            allowances[_allowanceID].spent,
            allowances[_allowanceID].beneficiary,
            allowances[_allowanceID].requiredApprovals,
            allowances[_allowanceID].approvers
        );
    }

    /// @return whether the given allowance is active
    function isAllowanceActive(uint _allowanceID) public view returns (bool) {
        bool isActive = false;
        for (uint i = 0; i < activeAllowances.length; i++) {
            if (activeAllowances[i] == _allowanceID) {
                isActive = true;
                break;
            }
        }

        return isActive;
    }

    /// @return ids of currently active allowances
    function getActiveAllowances() public view returns (uint[]) {
        return activeAllowances;
    }
}
