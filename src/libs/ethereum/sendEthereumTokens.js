const Web3 = require("web3");
const Tx = require('ethereumjs-tx').Transaction;
const axios = require("axios");
const { Hive } = require("@splinterlands/hive-interface")

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETHEREUM_ENDPOINT));
const hive = new Hive({rpc_error_limit: 5}, {rpc_nodes: process.env.HIVE_RPC_NODES.split(',')});

const tokenABI = require("./tokenABI.js");
const hiveEngineTokenPrice = require("../market/hiveEngineTokenPrice.js")

const mongo = require("../../mongo.js")
const database = mongo.get().db("oracle")

let proxyContractInteface = new web3.eth.Contract(require("./ProxyContractABI.json"), process.env.ETHEREUM_PROXY_CONTRACT_ADDRESS)

async function start(depositAmount, address, sender, logger, depositTransactionHash){
  try {
    let amount = depositAmount * Math.pow(10, process.env.ETHEREUM_TOKEN_PRECISION); //remove decimal places => 0.001, 3 decimal places => 0.001 * 1000 = 1
    amount = parseFloat(amount - (amount * (process.env.PERCENTAGE_DEPOSIT_FEE / 100))).toFixed(0); //remove % fee
    amount = parseFloat(amount - 1000).toFixed(0)
    if (amount <= 0){ //if amount is less than 1, refund
      refundFailedTransaction(depositAmount, sender, 'Amount after fees is less or equal to 0')
    } else {
      let id = await generateId()

      let from = process.env.ETHEREUM_ADDRESS
      let chainID = process.env.CHAIN_ID

      let contractFunction = proxyContractInteface.methods["transfer"](process.env.ETHEREUM_CONTRACT_ADDRESS, address, amount, id).encodeABI();
      let nonce = await web3.eth.getTransactionCount(process.env.ETHEREUM_ADDRESS, 'pending');

      let gasPrice = await getGasPrice();
      let rawTransaction = {
        "from": process.env.ETHEREUM_ADDRESS,
        "nonce": "0x" + nonce.toString(16),
        "gasPrice": web3.utils.toHex(gasPrice * 1e9),
        "gasLimit": web3.utils.toHex(process.env.ETHEREUM_GAS_LIMIT),
        "to": process.env.ETHEREUM_PROXY_CONTRACT_ADDRESS,
        "data": contractFunction,
        "chainId": process.env.ETHEREUM_CHAIN_ID
      };
      let createTransaction = await web3.eth.accounts.signTransaction(rawTransaction, process.env.ETHEREUM_PRIVATE_KEY)
      let txHash = await web3.utils.keccak256(createTransaction.rawTransaction)

      await database.collection("pending_transactions").insertOne({
        id: id,
        isPending: true, transactionHash: txHash, nonce: nonce,
        sender: sender, time: new Date().getTime(), data: contractFunction,
        gasPrice: gasPrice, lastUpdate: new Date().getTime()
      })

      sendDepositConfirmation(txHash, sender, depositTransactionHash)

      try {
        let receipt = await web3.eth.sendSignedTransaction(createTransaction.rawTransaction);
      } catch (e){
        console.log(`Error sending signed transaction: ${e}`)
      }

    }
  } catch(e){
    let details  = {
      depositAmount: depositAmount,
      address: address,
      sender: sender,
      time: new Date()
    }
    if ((e).toString().includes("insufficient funds for gas * price + value")){
      console.log(`Error while sending ERC-20 token (out of gas), refunded: ${e}, details: ${JSON.stringify(details)}`)
      logger.log('error', `Error while sending ERC-20 token (out of gas), refunded: ${e}, details: ${JSON.stringify(details)}`)
      refundFailedTransaction(depositAmount, sender, 'Internal server error while processing your request, details: Not enough ETH for gas cost')
    } else  if ((e).toString().includes("Transaction has been reverted by the EVM:")){
      console.log(`Error while sending ERC-20 token (EVM reverted), refunded: ${e}, details: ${JSON.stringify(details)}`)
      logger.log('error', `Error while sending ERC-20 token (EVM reverted), refunded: ${e}, details: ${JSON.stringify(details)}`)
      refundFailedTransaction(depositAmount, sender, 'Internal server error while processing your request, details: Transaction has been reverted by the EVM. Please try again!')
    } else {
      console.log(`Error NOT refunded: ${e}, details: ${JSON.stringify(details)}`)
      logger.log('error', `Error NOT refunded: ${e}, details: ${JSON.stringify(details)}`)
      refundFailedTransaction('0.001', sender, 'Internal server error while processing your request, please contact support')
    }
  }
}

async function generateId(){
  let max = 1000000000000000000
  let min = 0
  let a = Math.floor(Math.random() * (max - min + 1) + min)
  let b = Math.floor(Math.random() * (max - min + 1) + min)

  return a.toString() + b.toString()
}

async function sendFeeRefund(amount, sender){
  let json = {
    contractName: "tokens", contractAction: "transfer", contractPayload: {
      symbol: process.env.TOKEN_SYMBOL,
      to: sender,
      quantity: amount.toString(),
      memo: `Refund of over-estimated transaction fees: ${amount} ${process.env.TOKEN_SYMBOL}`
    }
  }
  let transaction = await hive.custom_json('ssc-mainnet-hive', json, process.env.HIVE_ACCOUNT, process.env.HIVE_ACCOUNT_PRIVATE_KEY, true);
}

async function sendDepositConfirmation(transactionHash, sender, depositTransactionHash){
  let memo;
  if (process.env.IS_LEO_BRIDGE_ENABLED && sender == 'leobridge'){
    memo = `Wrapped ${process.env.TOKEN_SYMBOL} tokens sent! Transaction Hash: ${transactionHash}, depositTxHash: ${depositTransactionHash}`
  } else {
    memo = `Wrapped ${process.env.TOKEN_SYMBOL} tokens sent! Transaction Hash: ${transactionHash}`
  }
  let json = {
    contractName: "tokens", contractAction: "transfer", contractPayload: {
      symbol: process.env.TOKEN_SYMBOL,
      to: sender,
      quantity: Math.pow(10, -(process.env.HIVE_TOKEN_PRECISION)).toString(),
      memo: memo
    }
  }
  let transaction = await hive.custom_json('ssc-mainnet-hive', json, process.env.HIVE_ACCOUNT, process.env.HIVE_ACCOUNT_PRIVATE_KEY, true);
}

async function refundFailedTransaction(depositAmount, sender, message){
  let json = {
    contractName: "tokens", contractAction: "transfer", contractPayload: {
      symbol: process.env.TOKEN_SYMBOL,
      to: sender,
      // quantity: depositAmount.toString(),
      quantity: Math.pow(10, -(process.env.HIVE_TOKEN_PRECISION)).toString(),
      memo: `Something went wrong while processing your transaction, but it's possible you will still receive your tokens. If you don't receive them, please contact support.`
    }
  }
  let transaction = await hive.custom_json('ssc-mainnet-hive', json, process.env.HIVE_ACCOUNT, process.env.HIVE_ACCOUNT_PRIVATE_KEY, true);
}

function getGasPrice(){
  return new Promise((resolve, reject) => {
    axios.get("https://api.bscscan.com/api?module=gastracker&action=gasoracle&apikey=" + process.env.BSC_SCAN_API_KEY)
      .then((res) => {
        resolve(Number(res.data.result.ProposeGasPrice))
      })
    .catch((e) => {
      console.log(`Error getting polygon gas price: ${e}`)
      resolve(100)
    })
  })
}

async function caculateTransactionFee(contract, address, amount, gasPrice){
  return new Promise(async (resolve, reject) => {
    let contractFunction = contract.methods[process.env.ETHEREUM_CONTRACT_FUNCTION](address, amount);
    let estimatedGas = await contractFunction.estimateGas({ from: process.env.ETHEREUM_ADDRESS });
    let wei = parseFloat(estimatedGas * gasPrice * 1000000000).toFixed(0)
    let etherValue = Web3.utils.fromWei(wei.toString(), 'ether');
    resolve({
      etherValue: etherValue,
      estimatedGas: estimatedGas
    })
  })
}

async function approveOnSetup(){
  let contract = new web3.eth.Contract(tokenABI.ABI, process.env.ETHEREUM_CONTRACT_ADDRESS);
  let data = contract.methods["approve"](process.env.ETHEREUM_PROXY_CONTRACT_ADDRESS, "99999999999999999999999999999999999999999").encodeABI();
  let nonce = await web3.eth.getTransactionCount(process.env.ETHEREUM_ADDRESS, 'pending');
  let rawTransaction = {
    "from": process.env.ETHEREUM_ADDRESS,
    "nonce": "0x" + nonce.toString(16),
    "gasPrice": web3.utils.toHex(10 * 1e9),
    "gasLimit": web3.utils.toHex(process.env.ETHEREUM_GAS_LIMIT),
    "to": process.env.ETHEREUM_CONTRACT_ADDRESS,
    "data": data,
    "chainId": process.env.ETHEREUM_CHAIN_ID
  };
  let createTransaction = await web3.eth.accounts.signTransaction(rawTransaction, process.env.ETHEREUM_PRIVATE_KEY)
  let receipt = await web3.eth.sendSignedTransaction(createTransaction.rawTransaction);
}


module.exports.start = start
module.exports.approveOnSetup = approveOnSetup
