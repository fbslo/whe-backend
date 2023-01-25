<h1>Wrapped Hive Engine Tokens</h1>

Copyright: @fbslo, 2020

---

This repo includes source code for ***backend*** of Wrapped Hive Engine (wHE) token oracle.

---

How does it work?

***Deposits***: conversion from native HE tokens to ERC20 tokens on Ethereum

User transfers tokens to @deposit-account with ethereum address as memo. On Ethereum, tokens are minted (or transfered) to that address.

***Withdrawals***: conversion from ERC20 tokens on Ethereum to Hive Engine tokens on Hive

User calls function in tokens smart contract. Both functions accept `amount`, `username` (in this order). It will emit `convertToken` event that is detected by oracle app.

function: `convertTokenWithBurn` or `convertTokenWithTransfer`

If you use mintable tokens, you should use `convertTokenWithBurn`, if you have fixed supply token, use `convertTokenWithTransfer` (it will transfer tokens back to hardcoded address)

For more info about contract, visit https://github.com/fbslo/wToken-contract

---

Installation:

Read: https://hive.blog/hiveengine/@fbslo/introducing-wrapped-hive-engine-tokens-wtokens-in-a-box

For ETHEREUM_PROXY_CONTRACT_ADDRESS address, deploy same code as on https://bscscan.com/address/0x5ae605e16d7655eedb16e02d78664cd6e383eefa#code.

---

Special thanks to @superoo7 and his work on https://github.com/superoo7/BSwap contract.

---

***THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.***
