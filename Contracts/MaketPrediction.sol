

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Project {
    struct Market {
        string question;
        uint256 endTime;
        uint256 totalYesStake;
        uint256 totalNoStake;
        bool resolved;
        bool outcome;
        address creator;
    }
    
    struct Bet {
        uint256 amount;
        bool prediction;
    }
    
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Bet)) public bets;
    uint256 public marketCount;
    uint256 public constant MIN_BET = 0.01 ether;
    
    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event BetPlaced(uint256 indexed marketId, address indexed user, uint256 amount, bool prediction);
    event MarketResolved(uint256 indexed marketId, bool outcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount);
    
    // Function 1: Create a new prediction market
    function createMarket(string memory _question, uint256 _duration) external returns (uint256) {
        require(_duration > 0, "Duration must be positive");
        require(bytes(_question).length > 0, "Question cannot be empty");
        
        uint256 marketId = marketCount++;
        markets[marketId] = Market({
            question: _question,
            endTime: block.timestamp + _duration,
            totalYesStake: 0,
            totalNoStake: 0,
            resolved: false,
            outcome: false,
            creator: msg.sender
        });
        
        emit MarketCreated(marketId, _question, block.timestamp + _duration);
        return marketId;
    }
    
    // Function 2: Place a bet on a market
    function placeBet(uint256 _marketId, bool _prediction) external payable {
        require(_marketId < marketCount, "Market does not exist");
        require(msg.value >= MIN_BET, "Bet amount too low");
        
        Market storage market = markets[_marketId];
        require(block.timestamp < market.endTime, "Market has ended");
        require(!market.resolved, "Market already resolved");
        require(bets[_marketId][msg.sender].amount == 0, "Already placed bet");
        
        bets[_marketId][msg.sender] = Bet({
            amount: msg.value,
            prediction: _prediction
        });
        
        if (_prediction) {
            market.totalYesStake += msg.value;
        } else {
            market.totalNoStake += msg.value;
        }
        
        emit BetPlaced(_marketId, msg.sender, msg.value, _prediction);
    }
    
    // Function 3: Resolve market and claim winnings
    function resolveMarket(uint256 _marketId, bool _outcome) external {
        require(_marketId < marketCount, "Market does not exist");
        
        Market storage market = markets[_marketId];
        require(msg.sender == market.creator, "Only creator can resolve");
        require(block.timestamp >= market.endTime, "Market not ended yet");
        require(!market.resolved, "Already resolved");
        
        market.resolved = true;
        market.outcome = _outcome;
        
        emit MarketResolved(_marketId, _outcome);
    }
    
    function claimWinnings(uint256 _marketId) external {
        require(_marketId < marketCount, "Market does not exist");
        
        Market storage market = markets[_marketId];
        require(market.resolved, "Market not resolved yet");
        
        Bet storage userBet = bets[_marketId][msg.sender];
        require(userBet.amount > 0, "No bet placed");
        require(userBet.prediction == market.outcome, "Incorrect prediction");
        
        uint256 totalWinningStake = market.outcome ? market.totalYesStake : market.totalNoStake;
        uint256 totalLosingStake = market.outcome ? market.totalNoStake : market.totalYesStake;
        uint256 winnings = userBet.amount + (userBet.amount * totalLosingStake / totalWinningStake);
        
        userBet.amount = 0;
        
        payable(msg.sender).transfer(winnings);
        
        emit WinningsClaimed(_marketId, msg.sender, winnings);
    }
    
    // Helper function to get market details
    function getMarket(uint256 _marketId) external view returns (
        string memory question,
        uint256 endTime,
        uint256 totalYesStake,
        uint256 totalNoStake,
        bool resolved,
        bool outcome
    ) {
        require(_marketId < marketCount, "Market does not exist");
        Market storage market = markets[_marketId];
        return (
            market.question,
            market.endTime,
            market.totalYesStake,
            market.totalNoStake,
            market.resolved,
            market.outcome
        );
    }
} 
