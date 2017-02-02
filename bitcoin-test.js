var BitcoinAcceptor = require('./bitcoinAcceptor')

var acceptor = new BitcoinAcceptor('FAKE_ADDR', {
  network: 'live'
})

// Make a privkey
var privkey = acceptor.generateKey()

console.log("Privkey: ", privkey)
console.log("Address: ", privkey.toAddress())

function sayBalance(x) {
  // Let's check the balance of this thing
  acceptor.checkBalance(x, (err, value) => {
    if (err) {
      throw err
    }
    
    console.log('Got balance of', x, ': ', value)
  })
}

// Say some balances
sayBalance(privkey)
sayBalance(privkey.toAddress())
sayBalance('198aMn6ZYAczwrE5NvNTUMyJ5qkfy4g3Hi')

