require("dotenv").config()
const ethers = require("ethers")

getBalance()

async function getBalance(){
  let itx = new ethers.providers.InfuraProvider(
    137,
    process.env.INFURA_ID
  )

  let { balance } = await itx.send('relay_getBalance', ["0x56687402dd89d03EE4cABf8A605f020AA0ef780A"])
  console.log(`Your current ITX balance is ${balance}`)
}
