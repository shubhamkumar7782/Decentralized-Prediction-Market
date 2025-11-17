// test/Project.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Decentralized Prediction Market", function () {
  let project;
  let owner, user1, user2, user3;
  const MIN_BET = ethers.utils.parseEther("0.01");

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();
    
    const Project = await ethers.getContractFactory("Project");
    project = await Project.deploy();
    await project.deployed();
  });

  describe("Market Creation", function () {
    it("Should create a market successfully", async function () {
      const question = "Will ETH reach $5000?";
      const duration = 3600; // 1 hour

      await expect(project.createMarket(question, duration))
        .to.emit(project, "MarketCreated")
        .withArgs(0, question, await time.latest() + duration + 1);

      const market = await project.getMarket(0);
      expect(market.question).to.equal(question);
      expect(market.resolved).to.equal(false);
    });

    it("Should fail with empty question", async function () {
      await expect(project.createMarket("", 3600))
        .to.be.revertedWith("Question cannot be empty");
    });

    it("Should fail with zero duration", async function () {
      await expect(project.createMarket("Test question?", 0))
        .to.be.revertedWith("Duration must be positive");
    });

    it("Should increment market count", async function () {
      await project.createMarket("Question 1?", 3600);
      await project.createMarket("Question 2?", 3600);
      
      expect(await project.marketCount()).to.equal(2);
    });
  });

  describe("Placing Bets", function () {
    beforeEach(async function () {
      await project.createMarket("Will BTC reach $100k?", 3600);
    });

    it("Should place a YES bet successfully", async function () {
      const betAmount = ethers.utils.parseEther("0.05");

      await expect(project.connect(user1).placeBet(0, true, { value: betAmount }))
        .to.emit(project, "BetPlaced")
        .withArgs(0, user1.address, betAmount, true);

      const userBet = await project.getUserBet(0, user1.address);
      expect(userBet.amount).to.equal(betAmount);
      expect(userBet.prediction).to.equal(true);
    });

    it("Should place a NO bet successfully", async function () {
      const betAmount = ethers.utils.parseEther("0.03");

      await project.connect(user2).placeBet(0, false, { value: betAmount });

      const userBet = await project.getUserBet(0, user2.address);
      expect(userBet.amount).to.equal(betAmount);
      expect(userBet.prediction).to.equal(false);
    });

    it("Should fail with bet below minimum", async function () {
      const lowBet = ethers.utils.parseEther("0.005");

      await expect(project.connect(user1).placeBet(0, true, { value: lowBet }))
        .to.be.revertedWith("Bet amount too low");
    });

    it("Should fail when betting twice", async function () {
      const betAmount = ethers.utils.parseEther("0.05");

      await project.connect(user1).placeBet(0, true, { value: betAmount });
      
      await expect(project.connect(user1).placeBet(0, false, { value: betAmount }))
        .to.be.revertedWith("Already placed bet");
    });

    it("Should fail on non-existent market", async function () {
      await expect(project.connect(user1).placeBet(999, true, { value: MIN_BET }))
        .to.be.revertedWith("Market does not exist");
    });

    it("Should update total stakes correctly", async function () {
      const yesBet = ethers.utils.parseEther("0.05");
      const noBet = ethers.utils.parseEther("0.03");

      await project.connect(user1).placeBet(0, true, { value: yesBet });
      await project.connect(user2).placeBet(0, false, { value: noBet });

      const market = await project.getMarket(0);
      expect(market.totalYesStake).to.equal(yesBet);
      expect(market.totalNoStake).to.equal(noBet);
    });
  });

  describe("Market Resolution", function () {
    beforeEach(async function () {
      await project.createMarket("Will SOL reach $200?", 3600);
      await project.connect(user1).placeBet(0, true, { value: ethers.utils.parseEther("0.05") });
      await project.connect(user2).placeBet(0, false, { value: ethers.utils.parseEther("0.03") });
    });

    it("Should resolve market successfully by creator", async function () {
      await time.increase(3601); // Move past end time

      await expect(project.resolveMarket(0, true))
        .to.emit(project, "MarketResolved")
        .withArgs(0, true);

      const market = await project.getMarket(0);
      expect(market.resolved).to.equal(true);
      expect(market.outcome).to.equal(true);
    });

    it("Should fail if not creator", async function () {
      await time.increase(3601);

      await expect(project.connect(user1).resolveMarket(0, true))
        .to.be.revertedWith("Only creator can resolve");
    });

    it("Should fail if market not ended", async function () {
      await expect(project.resolveMarket(0, true))
        .to.be.revertedWith("Market not ended yet");
    });

    it("Should fail if already resolved", async function () {
      await time.increase(3601);
      await project.resolveMarket(0, true);

      await expect(project.resolveMarket(0, false))
        .to.be.revertedWith("Already resolved");
    });
  });

  describe("Claiming Winnings", function () {
    beforeEach(async function () {
      await project.createMarket("Will AVAX reach $50?", 3600);
    });

    it("Should allow winner to claim winnings", async function () {
      const yesBet = ethers.utils.parseEther("0.05");
      const noBet = ethers.utils.parseEther("0.03");

      await project.connect(user1).placeBet(0, true, { value: yesBet });
      await project.connect(user2).placeBet(0, false, { value: noBet });

      await time.increase(3601);
      await project.resolveMarket(0, true); // YES wins

      const initialBalance = await ethers.provider.getBalance(user1.address);

      const tx = await project.connect(user1).claimWinnings(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const finalBalance = await ethers.provider.getBalance(user1.address);
      const expectedWinnings = yesBet.add(noBet); // Gets back their bet + losing stake

      expect(finalBalance.add(gasUsed).sub(initialBalance)).to.equal(expectedWinnings);
    });

    it("Should fail if market not resolved", async function () {
      await project.connect(user1).placeBet(0, true, { value: ethers.utils.parseEther("0.05") });

      await expect(project.connect(user1).claimWinnings(0))
        .to.be.revertedWith("Market not resolved yet");
    });

    it("Should fail if user didn't bet", async function () {
      await project.connect(user1).placeBet(0, true, { value: ethers.utils.parseEther("0.05") });
      
      await time.increase(3601);
      await project.resolveMarket(0, true);

      await expect(project.connect(user3).claimWinnings(0))
        .to.be.revertedWith("No bet placed");
    });

    it("Should fail if prediction was wrong", async function () {
      await project.connect(user1).placeBet(0, true, { value: ethers.utils.parseEther("0.05") });
      await project.connect(user2).placeBet(0, false, { value: ethers.utils.parseEther("0.03") });
      
      await time.increase(3601);
      await project.resolveMarket(0, true); // YES wins

      await expect(project.connect(user2).claimWinnings(0))
        .to.be.revertedWith("Incorrect prediction");
    });

    it("Should prevent double claiming", async function () {
      await project.connect(user1).placeBet(0, true, { value: ethers.utils.parseEther("0.05") });
      await project.connect(user2).placeBet(0, false, { value: ethers.utils.parseEther("0.03") });
      
      await time.increase(3601);
      await project.resolveMarket(0, true);

      await project.connect(user1).claimWinnings(0);

      await expect(project.connect(user1).claimWinnings(0))
        .to.be.revertedWith("No bet placed");
    });

    it("Should calculate proportional winnings correctly with multiple winners", async function () {
      const user1Bet = ethers.utils.parseEther("0.05");
      const user3Bet = ethers.utils.parseEther("0.02");
      const user2Bet = ethers.utils.parseEther("0.03");

      await project.connect(user1).placeBet(0, true, { value: user1Bet });
      await project.connect(user3).placeBet(0, true, { value: user3Bet });
      await project.connect(user2).placeBet(0, false, { value: user2Bet });

      await time.increase(3601);
      await project.resolveMarket(0, true); // YES wins

      const totalYesStake = user1Bet.add(user3Bet);
      const totalNoStake = user2Bet;

      // User1 should get: their bet + (their bet / total yes stake) * total no stake
      const expectedUser1Winnings = user1Bet.add(user1Bet.mul(totalNoStake).div(totalYesStake));

      const initialBalance = await ethers.provider.getBalance(user1.address);
      const tx = await project.connect(user1).claimWinnings(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      const finalBalance = await ethers.provider.getBalance(user1.address);

      expect(finalBalance.add(gasUsed).sub(initialBalance)).to.equal(expectedUser1Winnings);
    });
  });

  describe("View Functions", function () {
    it("Should return correct market details", async function () {
      const question = "Will MATIC reach $2?";
      const duration = 7200;

      await project.createMarket(question, duration);

      const market = await project.getMarket(0);
      expect(market.question).to.equal(question);
      expect(market.totalYesStake).to.equal(0);
      expect(market.totalNoStake).to.equal(0);
      expect(market.resolved).to.equal(false);
    });

    it("Should return correct user bet details", async function () {
      await project.createMarket("Test?", 3600);
      const betAmount = ethers.utils.parseEther("0.05");

      await project.connect(user1).placeBet(0, true, { value: betAmount });

      const userBet = await project.getUserBet(0, user1.address);
      expect(userBet.amount).to.equal(betAmount);
      expect(userBet.prediction).to.equal(true);
    });
  });
});
