const { getNamedAccounts, ethers } = require("hardhat");
const { getWeth, AMOUNT } = require("../scripts/getWeth");

async function main() {
	await getWeth();
	const { deployer } = await getNamedAccounts();

	// Lending Pool Address Provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
	// Lending Pool: we'll get it from the Lending pool address provider
	const lendingPool = await getLendingPool(deployer);
	console.log(`LendingPool address ${lendingPool.address}`);

	const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
	// approve - needed before attempting a deposit, otherwise we get a token not approved error
	await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer);
	console.log("Depositing...");
	// more info on deposit function on aave docs: https://docs.aave.com/developers/v/2.0/the-core-protocol/lendingpool#deposit
	await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0);
	console.log("Deposited!");
	let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer);
	const daiPRice = await getDaiPrice();
	// we're multiplying by 0.95 so we don't hit the cap that puts us at risk of liquidating
	const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPRice.toNumber());
	console.log(`You can borrow ${amountDaiToBorrow} DAI`);
	const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString());
	// to get this address, search dai taoken address eth mainnet on google; takes you to: https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
	const daiTokenAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
	await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer);
	await getBorrowUserData(lendingPool, deployer);
	await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer);
	await getBorrowUserData(lendingPool, deployer);
}

async function repay(amount, daiAddress, lendingPool, account) {
	// we need to approve again in order to send borrowed dai back to the contract
	await approveErc20(daiAddress, lendingPool.address, amount, account);
	const repayTx = await lendingPool.repay(daiAddress, amount, 1, account);
	await repayTx.wait(1);
	console.log("Repaid!");
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
	const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account);
	await borrowTx.wait(1);
	console.log("You've borrowed!");
}

async function getDaiPrice() {
	// get contract address from: https://docs.chain.link/docs/ethereum-addresses/
	// DAI / ETH on mainnet
	// we don't need to add deployer because we are just reading from this function, not sending a transaction
	// reading - don't need a signer; sending - need a signer
	const daiEthPriceFeed = await ethers.getContractAt(
		"AggregatorV3Interface",
		"0x773616E4d11A78F511299002da57A0a94577F1f4"
	);
	// we wrap the return value of latestRoundData (which returns 5 values) then we only take the 2nd value (index 1), as that is the price we need (check function signature in AggregatorV3Interface.sol)
	const price = (await daiEthPriceFeed.latestRoundData())[1];
	console.log(`The DAI/TH price is ${price.toString()}`);
	return price;
}

// docs for getUserAccountData: https://docs.aave.com/developers/v/2.0/the-core-protocol/lendingpool#getuseraccountdata
async function getBorrowUserData(lendingPool, account) {
	const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
		await lendingPool.getUserAccountData(account);
	console.log(`You have ${totalCollateralETH} worth of ETH deposited.`);
	console.log(`You have ${totalDebtETH} worth of ETH borrowed.`);
	console.log(`You can borrow  ${availableBorrowsETH} worth of ETH.`);
	return { availableBorrowsETH, totalDebtETH };
}

async function getLendingPool(account) {
	const lendingPoolAddressesProvider = await ethers.getContractAt(
		"ILendingPoolAddressesProvider",
		"0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
		account
	);

	const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool();
	const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account);

	return lendingPool;
}

// approves spenderAddress to spend our token
async function approveErc20(erc20Address, spenderAddress, amountToSpend, account) {
	const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account);
	const tx = await erc20Token.approve(spenderAddress, amountToSpend);
	await tx.wait(1);
	console.log("Approved!");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
