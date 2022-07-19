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

async function checkPendingTransactions(){
  let pending = await (await database.collection("pending_transactions").find({ isPending: true })).toArray()
  for (let i in pending){
    let txCount = await web3.eth.getTransactionCount(process.env.ETHEREUM_ADDRESS)
    let status = await web3.eth.getTransactionReceipt(pending[i].transactionHash)
    if (status && status.toString().length > 1){
      await storage.updateWithdrawal(pending[i].transactionHash, null);
      await storage.reducePending(pending[i].user, pending[i].amount)
    } else {
      if (new Date().getTime() - pending[i].time > (30 * 60000)){
        //tx was not yet processed
        console.log(`Updating: ${pending[i].transactionHash}`)
        let gasPrice = 10;
        let nonce = txCount > pending[i].nonce ? txCount : pending[i].nonce;
        let rawTransaction = {
          "from": process.env.ETHEREUM_ADDRESS,
          "nonce": "0x" + nonce.toString(16),
          "gasPrice": web3.utils.toHex(gasPrice * 1e9),
          "gasLimit": web3.utils.toHex(process.env.ETHEREUM_GAS_LIMIT),
          "to": process.env.ETHEREUM_CONTRACT_ADDRESS,
          "data": pending[i].data,
          "chainId": process.env.ETHEREUM_CHAIN_ID
        };
        let signedTransaction = await web3.eth.accounts.signTransaction(rawTransaction, process.env.ETHEREUM_PRIVATE_KEY)
        let txHash = await web3.utils.keccak256(signedTransaction.rawTransaction)

        await database.collection("pending_transactions").updateOne({ transactionHash: pending[i].transactionHash }, {$set: { isPending: false, replacedBy: txHash } }, (err, res) => {
          if (err) console.log(`Error updating pending transaction: ${err}`)
        })

        await database.collection("pending_transactions").insertOne({
          isPending: true,
          transactionHash: txHash,
          nonce: nonce,
          sender: pending[i].sender,
          time: new Date().getTime(),
          data: pending[i].data
       });

        try {
          let receipt = web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
          await new Promise(r => setTimeout(r, 10000));
        } catch (e){
          console.log(`Error sending signed transaction: ${e}`)
        }
      }
    }
  }
}

module.exports.checkPendingTransactions = checkPendingTransactions