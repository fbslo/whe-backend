const otherBridges = [
  'arbi-leo', //arbitrum
  'b-leo', //bsc
  'p-leo' //polygon
]

const bridgeMemos = [
  'dest:arbitrum-',
  'dest:bsc-',
  'dest:polygon-'
]

const targeBridges = [
  ['dest:arbitrum-', 'arbi-leo'],
  ['dest:bsc-', 'b-leo'],
  ['dest:polygon-', 'p-leo']
]

function isOtherBridge(sender){
  return otherBridges.includes(sender)
}

function isCrossBridgeMemo(memo){
  for (let m of bridgeMemos){
    if (memo.startsWith(m)) return true;
  }
  return false;
}

function getTargetBridgeAddress(memo){
  for (let t of targeBridges){
    if (memo.startsWith(t[0])) return t[1];
  }
  return null;
}

const crossBridgeRefundAddress = process.env.CROSS_BRIDGE_REFUND_ADDRESS || 'leofinance';

module.exports = {
  isOtherBridge: isOtherBridge,
  isCrossBridgeMemo: isCrossBridgeMemo,
  getTargetBridgeAddress: getTargetBridgeAddress,
  crossBridgeRefundAddress: crossBridgeRefundAddress
}