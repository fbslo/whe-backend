const fs = require("fs")
const mongo = require("../../mongo.js")
const database = mongo.get().db("oracle")

async function isFirstSetup(){
  return new Promise(async (resolve, reject) => {
    fs.readFile('./src/libs/setup/state.json', (err, result) => {
      if (err) reject(err)
      resolve(JSON.parse(result).isFirstSetup)
    })
  })
}

async function databaseSetup(){
  console.log(`Initializing database...`)
  let collections = ["status", "hive_transactions", "ethereum_transactions", "mempool", "signature_nonces"]
  await createCollections(collections);
  await updateState()
  await updateLastBlock()
  return;
}

function createCollections(collections){
  return new Promise((resolve, reject) => {
    collections.forEach((collection) => {
      database.createCollection(collection, (err, result) => {
        if (err && !err.toString().includes("already exists")) console.log(`Error during setup: ${err}`)
      })
    })
    resolve()
  })
}

function updateState(){
  fs.writeFile('./src/libs/setup/state.json', '{ "isFirstSetup": false }', (err, result) => {
    if (err) console.log(err)
  })
}

function updateLastBlock(){
  database.collection("status").insertOne({ type: "last_eth_block", block: 0 }, { upsert: true }, (err, result) => {
    if (err) reject(err)
  })
}

function updateSignatureNonce(){
  database.collection("signature_nonces").insertOne({ type: "latestNonce", nonce: 0 }, { upsert: true }, (err, result) => {
    if (err) reject(err)
  })
}

module.exports.isFirstSetup = isFirstSetup
module.exports.databaseSetup = databaseSetup
