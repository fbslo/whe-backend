const Web3 = require("web3")

const mongo = require("../../mongo.js")
const database = mongo.get().db("oracle")

const tokenABI = require("./tokenABI.js");
const web3 = new Web3(process.env.ETHEREUM_ENDPOINT);

let processedTransactions = []

async function start(callback){
  getERC20TransactionsByEvent(process.env.ETHEREUM_CONTRACT_ADDRESS)
    .then(async (result) => {
      let currentTransactions = []
      for (i in result){
        let isInTheDatabase = await isAlreadyInTheDatabase(result[i].transactionHash)
        if (!processedTransactions.includes(result[i].transactionHash) && !isInTheDatabase){
          processedTransactions.push(result[i].transactionHash)
          let json = JSON.stringify({
            status: true,
            blockHash: result[i].blockHash,
            event: result[i].event,
            conversionInformation: {
              username: result[i].returnValues.username,
              amount: result[i].returnValues.amount / Math.pow(10, process.env.ETHEREUM_TOKEN_PRECISION)
            }
          })
          addTransactionToDatabase(result[i].transactionHash)
          callback(result[i]) //return new transaction
        }
      }
    })
    .catch((err) => {
      console.log(err)
    })
}

async function getERC20TransactionsByEvent(tokenContractAddress) {
  return new Promise(async (resolve, reject) => {
    try {
      let currentBlockNumber = await web3.eth.getBlockNumber();
      let lastProcessedBlock = currentBlockNumber - 3000 //await getLastProcesedBlock()
      let fromBlock = lastProcessedBlock;
      let toBlock = currentBlockNumber - 12 //wait 12 confirmations
      let contract = new web3.eth.Contract(tokenABI.ABI, tokenContractAddress);
      try {
        let pastEvents = await contract.getPastEvents("convertToken", {}, { fromBlock: fromBlock, toBlock: toBlock })
        updateLastProcessedBlock(toBlock)
        resolve(pastEvents)
      } catch (e){
        console.log(`Error getting past events: ${e}`)
        resolve([])
      }
    } catch (e) {
      console.log(`Error getting block number: ${e}`)
      resolve([])
    }
  })
}

async function isAlreadyInTheDatabase(hash){
  return new Promise(async (resolve, reject) => {
    database.collection("ethereum_transactions").findOne({ transactionHash: hash }, (err, result) => {
      if (err) reject(err)
      else if (result == undefined) resolve(false)
      else resolve(true)
    })
  })
}

function getLastProcesedBlock(db){
  return new Promise(async (resolve, reject) => {
    database.collection("status").findOne({ type: "last_eth_block" }, (err, result) => {
      if (err) reject(err)
      else resolve(result.block)
    })
  })
}

function updateLastProcessedBlock(block){
  database.collection("status").updateOne({ type: "last_eth_block" }, { $set: { block: block } }, (err, result) => {
    if (err) console.log(err)
  })
}

function addTransactionToDatabase(hash){
  database.collection("ethereum_transactions").insertOne({ transactionHash: hash }, (err, result) => {
    if (err) console.log(err)
  })
}

module.exports.start = start
