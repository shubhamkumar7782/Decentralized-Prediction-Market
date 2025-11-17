// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  console.log("Deploying Decentralized Prediction Market...");

  // Get the contract factory
  const Project = await hre.ethers.getContractFactory("Project");
  
  // Deploy the contract
  const project = await Project.deploy();
  
  await project.deployed();

  console.log("✅ Decentralized Prediction Market deployed to:", project.address);
  console.log("📝 Save this address for future interactions!");
  
  // Wait for a few block confirmations
  console.log("⏳ Waiting for block confirmations...");
  await project.deployTransaction.wait(5);
  
  console.log("✅ Contract confirmed on blockchain!");
  console.log("\n📊 Contract Details:");
  console.log("- Minimum Bet:", await project.MIN_BET(), "wei");
  console.log("- Market Count:", (await project.marketCount()).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
