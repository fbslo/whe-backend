const Web3 = require("web3");
const Tx = require('ethereumjs-tx').Transaction;
const axios = require("axios");
const { Hive } = require("@splinterlands/hive-interface")
const sigUtil = require("eth-sig-util")
const ethers = require("ethers")

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETHEREUM_ENDPOINT));
const hive = new Hive({rpc_error_limit: 5}, {rpc_nodes: process.env.HIVE_RPC_NODES.split(',')});

const mongo = require("../../mongo.js")
const database = mongo.get().db("oracle")

async function send(tx, logger){
    try {
        let id = await generateId()
        let payload = JSON.parse(tx.payload)
        let sender = tx.sender
    
        let receiverAddress = payload.memo.split("-")[1]
        let isValidAddress = web3.utils.isAddress(receiverAddress)

        if (!isValidAddress){
            console.log(`Invalid Ethereum address from ${tx.sender}: ${receiverAddress}`)
            return;
        }
    
        //send normal transaction
        let nonce = await web3.eth.getTransactionCount(process.env.ETHEREUM_ADDRESS, 'pending');
        let gasPrice = await getGasPrice();
        let rawTransaction = {
          "from": process.env.ETHEREUM_ADDRESS,
          "nonce": "0x" + nonce.toString(16),
          "gasPrice": web3.utils.toHex(gasPrice * 1e9),
          "gasLimit": web3.utils.toHex(process.env.ETHEREUM_GAS_LIMIT),
          "to": receiverAddress,
          "data": '0x',
          "chainId": process.env.ETHEREUM_CHAIN_ID,
          "value": web3.utils.toHex(web3.utils.toWei(process.env.FAUCET_ETH_AMOUNT, 'ether'))
        };
        let createTransaction = await web3.eth.accounts.signTransaction(rawTransaction, process.env.ETHEREUM_PRIVATE_KEY)
        let txHash = await web3.utils.keccak256(createTransaction.rawTransaction)
    
        await database.collection("pending_transactions").insertOne({
          id: id,
          isPending: true, transactionHash: txHash, nonce: nonce,
          sender: sender, time: new Date().getTime(), data: '0x',
          gasPrice: gasPrice, lastUpdate: new Date().getTime()
        })
        
        try {
          let receipt = await web3.eth.sendSignedTransaction(createTransaction.rawTransaction);
        } catch (e){
          console.log(`Error sending signed transaction: ${e}`)
        }
    } catch (e){
        console.log(`Error in faucet send: ${e}`)
    }
}

async function generateId(){
    let max = 1000000000000000000
    let min = 0
    let a = Math.floor(Math.random() * (max - min + 1) + min)
    let b = Math.floor(Math.random() * (max - min + 1) + min)
  
    return a.toString() + b.toString()
}

function getGasPrice(){
    return 1;
}
module.exports.send = send