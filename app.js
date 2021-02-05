import readline from 'readline'
import fs from 'fs'
import ini from 'ini'
import Binance from 'binance-api-node'
import moment from 'moment'
import roundTo from 'round-to'

import Messages from './constants'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const TEST_API_KEY = '61gDpbIPvrL2MDjI4QS6w0X4rT0ZDURzCepGcpLh36z6zyBJz7JSDFuKV2XDcFeO'
const TEST_API_SECRET = 'FTYcU6KSIbqCVgnVy3wNlsUgpMS7UXQFTJ70vU6hSxZ02dystqlehpglYjqplc3l'

class Bot {
  _binanceClient = null
  _stopValue = 55
  _stopLimitValue = 50
  _btcBalance = 0
  _usdtBalance = 0
  _takeProfit = 0
  _btcToUse = 0
  _coinName = ''
  _order = {                                           
    symbol: 'SKYBTC',                         
    orderId: 48819953,                        
    orderListId: -1,                          
    clientOrderId: 'ZQ4Nuzsg7eQ3BrJUIcovRm',  
    transactTime: 1612507184051,              
    price: '0.00000000',                      
    origQty: '10.00000000',                                
    executedQty: '10.00000000',               
    cummulativeQuoteQty: '0.00028130',        
    status: 'FILLED',                         
    timeInForce: 'GTC',                       
    type: 'MARKET',                           
    side: 'BUY',                              
    fills: [                                  
      {                                       
        // price: '0.00002813',                  
        // price: '0.00010999',                  
        price: '0.00009053',                  
        qty: '10.00000000',                   
        commission: '0.01000000',             
        commissionAsset: 'SKY',               
        tradeId: 7022727                      
      }                                       
    ]                                         
  } 
  _order_fill = {                                       
    // price: '0.00002813',                  
    // price: '0.00010999',                  
    price: '0.00009053',                  
    qty: '10.00000000',                   
    commission: '0.01000000',             
    commissionAsset: 'SKY',               
    tradeId: 7022727                      
  }      

  __PAIR = 'BTC'

  /**
   * Run the bot
   */
  async run () {
    // this.printBotTitle()
    await this.connectToBinance()
    await this.getBalance()
    console.log(`Available BTC: ${this._btcBalance}`)
    console.log(`Available USDT: 1889.67`)
    console.log(`Stop at ${this._stopValue}%. Stop limit at ${this._stopLimitValue}%. (You can change this value in future/next update).`)
    // console.log(`Available USDT: ${this._usdtBalance}`)
    this.processQuestions()
  }

  processQuestions () {
    // this.resetInputValues()
    this.askTakeProfit ()
  }

  askTakeProfit () {
    this.newLine()
    rl.question("Take profit at: ", (profitAns) => {
      this.validateInput(profitAns.trim(), true, 'askTakeProfit')
      this._takeProfit = profitAns.trim()
      this.askBtcToUse()
    })
  }
  
  askBtcToUse() {
    this.newLine()
    rl.question("Total BTC to use: ", (totalAns) => {
      this.validateInput(totalAns.trim(), true, 'askBtcToUse')
      this._btcToUse = totalAns.trim()
      this.askCoinName()
    })
  }
  
  askCoinName () {
    this.newLine()
    rl.question("Coin name: ", (coinAns) => {
      this.validateInput(coinAns.trim(), false, 'askCoinName')
      this._coinName = coinAns.trim()
      this.newLine()
      this.placeMarketBuy()
    })
  }

  async placeMarketBuy () {
    console.log(`[${this.getTime()}]` ,'Placing market order...')
    const pair = `${this._coinName.toUpperCase()}${this.__PAIR}`
    try {
      // this._order = await this._binanceClient.order({
      //   symbol: pair,
      //   side: 'BUY',
      //   type: 'MARKET',
      //   quoteOrderQty: +this._btcToUse
      // })
      // const [ fill ] = this._order.fills.slice(-1)
      // this._order_fill = fill
      // console.log(this._order)
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
      console.log('\tAverage Price: ', +this._order_fill.price)
      this.newLine()
      this.requestSellOrder()
    }
  }

  // getSellOrderPrice (price, noOfDecPlaces) {
  //   if ((noOfDecPlaces > 0) && (this.countDecimal(price) > noOfDecPlaces)) {
  //     // return roundTo(price, noOfDecPlaces)
  //     return price.toFixed(noOfDecPlaces)
  //     // return price
  //   }

  //   return price
  // }

  getSellOrderPrice (price) {
    const buyPrice = +this._order_fill.price
    const noOfDecPlaces = this.countDecimal(buyPrice)
    const newPrice = (buyPrice * (price / 100)) 
    if ((noOfDecPlaces > 0) && (this.countDecimal(newPrice) > noOfDecPlaces)) {
      return newPrice.toFixed(noOfDecPlaces)
    }

    return price
  }

  printAndGetSellOrderConfig () {
    const sellPrice = this.getSellOrderPrice(this._takeProfit)
    const stopPrice = this.getSellOrderPrice(this._stopValue)
    const stopLimitPrice = this.getSellOrderPrice(this._stopLimitValue)
    this.newLine()
    console.log(`Take profit at ${sellPrice} (${this._takeProfit}%)`)
    console.log(`Stop at ${sellPrice} (${this._stopValue}%)`)
    console.log(`Stop limit at ${stopLimitPrice} (${this._stopLimitValue}%)`)
    this.newLine()
    console.log(`[${this.getTime()}]` ,'Requesting OCO order...')

    return [sellPrice, stopPrice, stopLimitPrice]
  }

  requestSellOrder () {
    const [sellPrice, stopPrice, stopLimitPrice] = this.printAndGetSellOrderConfig()
    const pair = `${this._coinName.toUpperCase()}${this.__PAIR}`
    // try {
    //   const response = this._binanceClient.orderOco({
    //     symbol: pair,
    //     side: 'SELL',
    //     quantity: +this._order.executedQty,
    //     price: sellPrice,
    //     stopPrice: stopPrice,
    //     stopLimitPrice: stopLimitPrice
    //   })
    //   console.log({ response })
    // } catch (error) {
    //   console.log({ error: error.message })
    // }

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
    }
    if (shouldBeNumber) {
      const regExp = /^[0-9]*\.?[0-9]*$/;
      if (input.match(regExp) === null) {
        console.log('\x1b[33m%s\x1b[0m', Messages.NUMBER_ONLY)
        this[question]()
      }
      if (input < 0) {
        console.log('\x1b[33m%s\x1b[0m', Messages.LIMIT_ZERO)
        this[question]()
      }
    }
    // if (question.name === 'askBtcToUse') {
    //   if (input > _btcBalance) {
    //     console.log('\x1b[33m%s\x1b[0m', 'Value should not be more than available BTC')
    //     question()
    //   }
    // }
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
    this.order = null
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
