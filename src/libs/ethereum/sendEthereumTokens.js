const Web3 = require("web3");
const Tx = require('ethereumjs-tx').Transaction;
const axios = require("axios");
const { Hive } = require("@splinterlands/hive-interface")
const sigUtil = require("eth-sig-util")
const ethers = require("ethers")

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETHEREUM_ENDPOINT));
const hive = new Hive({rpc_error_limit: 5}, {rpc_nodes: process.env.HIVE_RPC_NODES.split(',')});

const tokenABI = require("./tokenABI.js");
const hiveEngineTokenPrice = require("../market/hiveEngineTokenPrice.js")

async function start(depositAmount, address, sender, logger, depositTransaction){
  try {
    let amount = depositAmount * Math.pow(10, process.env.ETHEREUM_TOKEN_PRECISION); //remove decimal places => 0.001, 3 decimal places => 0.001 * 1000 = 1
    amount = parseFloat(amount - (amount * (process.env.PERCENTAGE_DEPOSIT_FEE / 100))).toFixed(0); //remove % fee
    let contract = new web3.eth.Contract(tokenABI.ABI, process.env.ETHEREUM_CONTRACT_ADDRESS);
    amount = parseFloat(amount - (process.env.FIXED_FEE * Math.pow(10, process.env.ETHEREUM_TOKEN_PRECISION))).toFixed(0); //remove fixed fee of 1 token
    if (amount <= 0){ //if amount is less than 0, refund
      refundFailedTransaction(depositAmount, sender, 'Amount after fees is less or equal to 0')
    } else {

      let sigNonce = await getSignatureNonce();
      let signatureTransfer = await prepareSignature(process.env.ETHEREUM_ADDRESS, address, amount, sigNonce);
      let from = process.env.ETHEREUM_ADDRESS
      let chainID = process.env.CHAIN_ID

      let contractFunction = contract.methods["transferWithPermit"](from, address, amount, signatureTransfer, sigNonce).encodeABI();
      const tx = {
        to: process.env.ETHEREUM_CONTRACT_ADDRESS,
        data: contractFunction,
        gas: process.env.ETHEREUM_GAS_LIMIT,
        schedule: 'fast'
      }

      const itx = new ethers.providers.InfuraProvider(
        'polygon',
        process.env.INFURA_ENDPOINT
      )
      const signer = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, itx)
      const signature = await signRequest(tx)
      const relayTransactionHash = await itx.send('relay_sendTransaction', [
        tx,
        signature
      ])
      console.log(`ITX relay hash: ${relayTransactionHash}`)

      sendDepositConfirmation(relayTransactionHash, sender, depositTransaction)
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
    } else {
      console.log(`Error NOT refunded: ${e}, details: ${JSON.stringify(details)}`)
      logger.log('error', `Error NOT refunded: ${e}, details: ${JSON.stringify(details)}`)
      refundFailedTransaction('0.001', sender, 'Internal server error while processing your request, please contact support')
    }
  }
}

async function signRequest(tx) {
  const relayTransactionHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes', 'uint', 'uint', 'string'],
      [tx.to, tx.data, tx.gas, 137, tx.schedule]
    )
  )
  return await signer.signMessage(ethers.utils.arrayify(relayTransactionHash))
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
      quantity: depositAmount.toString(),
      memo: `Refund! ${message}.`
    }
  }
  let transaction = await hive.custom_json('ssc-mainnet-hive', json, process.env.HIVE_ACCOUNT, process.env.HIVE_ACCOUNT_PRIVATE_KEY, true);
}

function prepareSignature(from, to, amount, nonce){
  return new Promise(async (resolve, reject) => {
    let msgHash = await web3.utils.soliditySha3(from, to, amount, nonce, process.env.ETHEREUM_CONTRACT_ADDRESS, process.env.CHAIN_ID);
    let msgParams = {
      data: msgHash
    }

    if (!process.env.ETHEREUM_PRIVATE_KEY.startsWith('0x')) process.env.ETHEREUM_PRIVATE_KEY = '0x' + process.env.ETHEREUM_PRIVATE_KEY

    let signature = await sigUtil.personalSign(ethers.utils.arrayify(process.env.ETHEREUM_PRIVATE_KEY), msgParams)
    resolve(signature);
  })
}

async function getSignatureNonce(nonce){
  return new Promise(async (resolve, reject) => {
    database.collection("signature_nonces").findAndModify({
      query: {type: "latestNonce"},
      update: {$inc: {count: 1}},
      new: false
    }, (err, result) =>{
      if (err) reject(err)
      else if (result == undefined) resolve(false)
      else resolve(result.nonce)
    })
  })
}

module.exports.start = start
