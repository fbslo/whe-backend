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
  let tokenABI = require("./tokenABI.js");
  let contract = new web3.eth.Contract(tokenABI.ABI, process.env.ETHEREUM_CONTRACT_ADDRESS);

  for (let i in pending){
    try {
      let getOnChainStatus = await contract.methods.nonces(process.env.ETHEREUM_ADDRESS, pending[i].id).call()

      if (getOnChainStatus){
        await database.collection("pending_transactions").updateOne({ id: pending[i].id },
          {$set: { isPending: false, lastUpdate: new Date().getTime() } }, (err, res) => { if (err) console.log(`Error updating pending transaction: ${err}`) }
        )
      } else {
        if (new Date().getTime() - pending[i].lastUpdate > (30 * 60000)){
          console.log(`Updating: ${pending[i].id}`)
          let nonce = await web3.eth.getTransactionCount(process.env.ETHEREUM_ADDRESS, 'pending');
          let gasPrice = await getGasPrice();

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

          await database.collection("pending_transactions").updateOne({ id: pending[i].id },
            {$set: { isPending: true, lastUpdate: new Date().getTime(), gasPrice: gasPrice } }, (err, res) => { if (err) console.log(`Error updating pending transaction: ${err}`) }
          )

          try {
            let receipt = web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
            await new Promise(r => setTimeout(r, 10000));
          } catch (e){
            console.log(`Error sending signed transaction: ${e}`)
          }
        }
      }
    } catch (e){
      console.log(`Error checking pending transaction: `, e)
    }
  }
}

function getGasPrice(){
  return new Promise((resolve, reject) => {
    axios.get("https://api.polygonscan.com/api?module=gastracker&action=gasoracle&apikey=" + process.env.POLYGON_SCAN_API_KEY)
      .then((res) => {
        resolve(parseFloat(Number(res.data.result.ProposeGasPrice) + 5).toFixed(0))
      })
    .catch((e) => {
      console.log(`Error getting polygon gas price: ${e}`)
      resolve(100)
    })
  })
}

module.exports.checkPendingTransactions = checkPendingTransactions
