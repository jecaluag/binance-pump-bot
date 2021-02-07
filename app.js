import readline from 'readline'
import fs from 'fs'
import ini from 'ini'
import Binance from 'binance-api-node'
import moment from 'moment'

import Messages from './constants'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class Bot {
  _binanceClient = null
  _stopValue = 55
  _stopLimitValue = 50
  _btcBalance = 0
  _usdtBalance = 0
  _takeProfit = 0
  _btcToUse = 0
  _coinName = ''
  _order = null
  _order_fill = null
  __PAIR = 'BTC'

  /**
   * Run the bot
   */
  async run () {
    // this.printBotTitle()
    await this.connectToBinance()
    this.startBot()
  }

  async startBot () {
    await this.getBalance()
    console.log(`Available BTC: ${this._btcBalance}`)
    console.log(`Available USDT: ${this._usdtBalance}`)
    console.log(`Stop at ${this._stopValue}%. Stop limit at ${this._stopLimitValue}%. (You can change this value in future/next update).`)
    this.processQuestions()
  }

  processQuestions () {
    this.resetInputValues()
    this.askTakeProfit ()
  }

  askTakeProfit () {
    this.newLine()
    rl.question("Take profit at (%): ", (profitAns) => {
      if (this.validateInput(profitAns.trim(), true, 'askTakeProfit') === true) {
        this._takeProfit = profitAns.trim()
        this.askBtcToUse()
      }
    })
  }
  
  askBtcToUse() {
    this.newLine()
    rl.question("Total BTC to use: ", (totalAns) => {
      if (this.validateInput(totalAns.trim(), true, 'askBtcToUse') === true) {
        this._btcToUse = totalAns.trim()
        this.askCoinName()
      }
    })
  }
  
  askCoinName () {
    this.newLine()
    rl.question("Coin name: ", (coinAns) => {
      if (this.validateInput(coinAns.trim(), false, 'askCoinName') === true) {
        this._coinName = coinAns.trim()
        this.newLine()
        // this.placeMarketBuy()
      }
    })
  }

  /**
   * Validate user input
   * @param {*} input - string
   * @param {*} shouldBeNumber - boolean
   * @param {*} question - function
   */
  validateInput (input, shouldBeNumber, question) {
    if (input === '') {
      console.log('\x1b[33m%s\x1b[0m', Messages.EMPTY_VALUE)
      this[question]()

      return false
    }
    if (shouldBeNumber) {
      const regExp = /^[0-9]*\.?[0-9]*$/;
      if (input.match(regExp) === null) {
        console.log('\x1b[33m%s\x1b[0m', Messages.NUMBER_ONLY)
        this[question]()

        return false
      }
      if (input < 0) {
        console.log('\x1b[33m%s\x1b[0m', Messages.LIMIT_ZERO)
        this[question]()

        return false
      }
    }
    if (question.name === 'askBtcToUse') {
      if (input > _btcBalance) {
        console.log('\x1b[33m%s\x1b[0m', 'Value should not be more than available BTC')
        question()

        return false
      }
    }

    return true
  }

  async placeMarketBuy () {
    console.log(`[${this.getTime()}]` ,'Placing market order...')
    const pair = `${this._coinName.toUpperCase()}${this.__PAIR}`
    try {
      this._order = await this._binanceClient.order({
        symbol: pair,
        side: 'BUY',
        type: 'MARKET',
        quoteOrderQty: +this._btcToUse
      })
      const [ fill ] = this._order.fills.slice(-1)
      this._order_fill = fill
      this.printOrder()
    } catch (error) {
      this._order = null
      if (error.message.split(':').length > 1) {
        const errorCode = error.message.split(':')[1].trim()
        this.showError(Messages[errorCode], false)
        this.askBtcToUse()

        return
      }
      if (error.message === 'Invalid symbol.') {
        this.showError(Messages.INVALID_COIN_NAME, false)
        this.askCoinName()

        return
      }

      this.showError(error.message, false)
      this.askBtcToUse()
    }
  }

  async printOrder () {
    if (this._order !== null || this._order_fill !== null) {
      this.newLine()
      console.log('\x1b[32m%s\x1b[0m', '\tORDER SUCCESSFULLY FILLED!!!')
      console.log('\tDate:', moment(this._order.transactTime).format("DD-MM-YYYY h:mm:ss"))
      console.log('\tOrder ID:', this._order.orderId)
      console.log('\tType:', this._order.type)
      console.log('\tExecuted Quantity:', +this._order.executedQty)
      console.log('\tAmount Quantity:', +this._order.origQty)
      console.log('\tBought at: ', +this._order_fill.price)
      this.newLine()
      this.requestSellOrder()
    }
  }

  getSellOrderPrice (price) {
    const buyPrice = +this._order_fill.price
    const noOfDecPlaces = this.countDecimal(buyPrice)
    const newPrice = (buyPrice * (price / 100)) 
    if ((noOfDecPlaces > 0) && (this.countDecimal(newPrice) > noOfDecPlaces)) {
      return newPrice.toFixed(noOfDecPlaces)
    }

    return newPrice
  }

  printAndGetSellOrderConfig () {
    const sellPrice = this.getSellOrderPrice(this._takeProfit)
    const stopPrice = this.getSellOrderPrice(this._stopValue)
    const stopLimitPrice = this.getSellOrderPrice(this._stopLimitValue)
    this.newLine()
    console.log(`[${this.getTime()}]` ,'Requesting OCO order...')

    return [sellPrice, stopPrice, stopLimitPrice]
  }

  async requestSellOrder () {
    const [sellPrice, stopPrice, stopLimitPrice] = this.printAndGetSellOrderConfig()
    const pair = `${this._coinName.toUpperCase()}${this.__PAIR}`
    try {
      const response = await this._binanceClient.orderOco({
        symbol: pair,
        side: 'SELL',
        quantity: +this._order.executedQty,
        price: sellPrice,
        stopPrice: stopPrice,
        stopLimitPrice: stopLimitPrice
      })
      this.printSellOrder(response)
    } catch (error) {
      console.log('\x1b[41m%s\x1b[0m', 'Failed to request OCO order.')
      if (error.message.split(':').length > 1) {
        const errorCode = error.message.split(':')[1].trim()
        this.showError(Messages[errorCode], false)

        return
      }

      this.showError(error.message, false)
    }
  }

  printSellOrder (response) {
    const limitMaker = response.orderReports.find(order => order.type === 'LIMIT_MAKER')
    const stopLossLimit = response.orderReports.find(order => order.type === 'STOP_LOSS_LIMIT')
    this.newLine()
    console.log('\x1b[32m%s\x1b[0m', '\tSELL OCO ORDER SUCCESSFULLY FILLED!!!')
    console.log('\tDate:', moment(response.transactTime).format("DD-MM-YYYY h:mm:ss"))
    console.log(`\tTake profit limit order placed at ${limitMaker.price} (${+limitMaker.origQty} ${this._coinName.toUpperCase()})`)
    console.log(`\tStop loss placed at ${stopLossLimit.stopPrice} (${+stopLossLimit.origQty} ${this._coinName.toUpperCase()})`)
    console.log(`\tStop limit placed at ${stopLossLimit.price} (${+stopLossLimit.origQty} ${this._coinName.toUpperCase()})`)
    this.askRunBotAgain()
  }

  askRunBotAgain () {
    this.newLine()
    rl.question("Run bot again? (yes/no) ", (ans) => {
      if (ans !== 'yes' && ans !== 'no') {
        this.askRunBotAgain()

        return
      }
      if (ans === 'yes') {
        this._btcBalance = 0
        this._usdtBalance = 0
        this.startBot()

        return
      }

      process.exit()
    })
  }

  /**
   * Get the api secret and key from settings.ini and validate its value
   */
  getAndValidateApiKeyAndSecret () {
    const apiSettings = ini.parse(fs.readFileSync('./settings.ini', 'utf-8'))
    try {
      const API_KEY = apiSettings.API_KEY
      const API_SECRET = apiSettings.API_SECRET
      if (API_KEY.trim() === '' || API_SECRET.trim() === '') {
        this.showError(Messages.EMPTY_API)
      }
  
      return [API_KEY, API_SECRET]
    } catch {
      this.showError(Messages.INVALID_API)
    }
  }

  /**
   * Connect to binance using the api key and secret, test the connection by getting the balance of the user
   */
  async connectToBinance () {
    const [ API_KEY, API_SECRET ] = this.getAndValidateApiKeyAndSecret()
    this._binanceClient = new Binance({
      apiKey: API_KEY,
      apiSecret: API_SECRET
    })
    try {
      if (await this._binanceClient.ping() === false) {
        this.showError(Messages.CANT_CONNECT_BINANCE)
      }
    } catch {
      this.showError(Messages.CANT_CONNECT_BINANCE)
    }
  }

  async getBalance () {
    try {
      const response = await this._binanceClient.accountInfo()
      const balances = response.balances
      this._btcBalance = balances.find(coin => coin.asset === 'BTC').free
      this._usdtBalance = balances.find(coin => coin.asset === 'USDT').free
    } catch {
      this.showError(Messages.CANT_GET_BALANCE)
    }
  }

  handleBinanceError (error) {
    console.log(JSON.parse(error.body).code)
    console.log(`Error: ${JSON.parse(error.body).msg}`)
    process.exit(0)
  }

  showError (message, exitApp = true) {
    console.log('\x1b[41m%s\x1b[0m', `[ERROR]: ${message}`)
    if (exitApp === true) {
      process.exit(0)
    }
  }

  /**
   * Reset values
   */
  resetInputValues () {
    this._takeProfit = 0
    this._btcToUse = 0
    this._coinName = ''
    this._order = null
    this._order_fill = null
  }

  newLine () {
    console.log('')
  }

  getTime () {
    return moment(new Date().valueOf()).format("DD-MM-YYYY h:mm:ss")
  }

  countDecimal (value) {
    if (Math.floor(value) !== value) {
      return value.toString().split(".")[1].length || 0
    }
        
    return 0
  }

  logToJson (json) {
    fs.writeFile('response.json', JSON.stringify(json), 'utf8', (err) => {
      if (err) console.log('error logging to json');
      console.log('success logging to json')
    });
  }

  printBotTitle () {
    console.log(`
    ▄████▄  ▄▄▄      ███▄    █ ▄████▄ ▓█████ ██▀███  ▒█████  █    ██  ██████     ██▓███  █    ██ ███▄ ▄███▓██▓███      ▄▄▄▄   ▒█████ ▄▄▄█████▓
    ▒██▀ ▀█ ▒████▄    ██ ▀█   █▒██▀ ▀█ ▓█   ▀▓██ ▒ ██▒██▒  ██▒██  ▓██▒██    ▒    ▓██░  ██▒██  ▓██▓██▒▀█▀ ██▓██░  ██▒   ▓█████▄▒██▒  ██▓  ██▒ ▓▒
    ▒▓█    ▄▒██  ▀█▄ ▓██  ▀█ ██▒▓█    ▄▒███  ▓██ ░▄█ ▒██░  ██▓██  ▒██░ ▓██▄      ▓██░ ██▓▓██  ▒██▓██    ▓██▓██░ ██▓▒   ▒██▒ ▄█▒██░  ██▒ ▓██░ ▒░
    ▒▓▓▄ ▄██░██▄▄▄▄██▓██▒  ▐▌██▒▓▓▄ ▄██▒▓█  ▄▒██▀▀█▄ ▒██   ██▓▓█  ░██░ ▒   ██▒   ▒██▄█▓▒ ▓▓█  ░██▒██    ▒██▒██▄█▓▒ ▒   ▒██░█▀ ▒██   ██░ ▓██▓ ░ 
    ▒ ▓███▀ ░▓█   ▓██▒██░   ▓██▒ ▓███▀ ░▒████░██▓ ▒██░ ████▓▒▒▒█████▓▒██████▒▒   ▒██▒ ░  ▒▒█████▓▒██▒   ░██▒██▒ ░  ░   ░▓█  ▀█░ ████▓▒░ ▒██▒ ░ 
    ░ ░▒ ▒  ░▒▒   ▓▒█░ ▒░   ▒ ▒░ ░▒ ▒  ░░ ▒░ ░ ▒▓ ░▒▓░ ▒░▒░▒░░▒▓▒ ▒ ▒▒ ▒▓▒ ▒ ░   ▒▓▒░ ░  ░▒▓▒ ▒ ▒░ ▒░   ░  ▒▓▒░ ░  ░   ░▒▓███▀░ ▒░▒░▒░  ▒ ░░   
      ░  ▒    ▒   ▒▒ ░ ░░   ░ ▒░ ░  ▒   ░ ░  ░ ░▒ ░ ▒░ ░ ▒ ▒░░░▒░ ░ ░░ ░▒  ░ ░   ░▒ ░    ░░▒░ ░ ░░  ░      ░▒ ░        ▒░▒   ░  ░ ▒ ▒░    ░    
    ░         ░   ▒     ░   ░ ░░          ░    ░░   ░░ ░ ░ ▒  ░░░ ░ ░░  ░  ░     ░░       ░░░ ░ ░░      ░  ░░           ░    ░░ ░ ░ ▒   ░      
    ░ ░           ░  ░        ░░ ░        ░  ░  ░        ░ ░    ░          ░                ░           ░               ░         ░ ░          
    ░                          ░                                                                                             ░                 
    `);
    this.newLine()
    console.log('#######################################################################################################################################################')
  }
}

new Bot().run()
