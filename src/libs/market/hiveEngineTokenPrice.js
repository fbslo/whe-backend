const axios = require("axios");

async function start(){
  let hiveEtherRate = await getHiveEtherRate()
  let hiveHETokenRate = await getHiveHETokenRate()
  let etherHETokenRate = parseFloat(hiveEtherRate * hiveHETokenRate).toFixed(8)
  return etherHETokenRate;
}

function getHiveEtherRate(){
  return new Promise((resolve, reject) => {
    axios
      .get('https://api.coingecko.com/api/v3/coins/hive')
      .then((result) => {
        resolve(result.data.market_data.current_price.eth)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

function getHiveHETokenRate(){
  return new Promise((resolve, reject) => {
    let url = process.env.HIVE_ENGINE_RPC + '/contracts'
    let params = { 'contract': 'market', 'table': 'buyBook', 'query': { 'symbol': process.env.TOKEN_SYMBOL }, 'limit': 1000, 'offset': 0, 'indexes': [] }
    let request_body = { 'jsonrpc': '2.0', 'id': 1, 'method': 'find', 'params': params }
    axios
      .post(url, request_body)
      .then(async (result) => {
        let price = result.data.result
        resolve(price[price.length - 1].price)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

module.exports.start = start
