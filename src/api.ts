import axios from 'axios'
import Decimal from 'decimal.js'
import moment, { Moment } from 'moment'
import { request, gql } from 'graphql-request'

const ApiCache = {
  caches: {} as Record<
    string,
    {
      data: any
      date: Moment
    }
  >,
  setCache: (cacheKey: string, data: any) => {
    ApiCache.caches[cacheKey] = {
      data,
      date: moment(),
    }
  },

  getCache: (cacheKey: string): any | void => {
    const target = ApiCache.caches[cacheKey]

    if (!target) {
      return
    }

    if (target.date.clone().add(30, 'seconds').isAfter(moment())) {
      console.log('using cachhe', cacheKey)
      return target.data
    }

    console.log('cache timed out', cacheKey)
  },

  request: async (url: string): Promise<any> => {
    const currentCache = ApiCache.getCache(url)

    if (currentCache) {
      return currentCache
    }

    const { data } = await axios.get(url)

    ApiCache.setCache(url, data)

    return data
  },

  graphqlRequest: async (
    url: string,
    query: string,
    variables: Record<string, string | number>
  ): Promise<any> => {
    const cacheKey = `${url}-${JSON.stringify(variables)}`
    const currentCache = ApiCache.getCache(cacheKey)
    if (currentCache) {
      return currentCache
    }

    const data = await request(url, query, variables)

    ApiCache.setCache(cacheKey, data)

    return data
  },
}

const ordersQuery = gql`
  query getOrders($skip: Int, $first: Int) {
    orders(first: $first, skip: $skip) {
      createdTimestamp
      executedTimestamp
      status
      creator
    }
  }
`

type Stat = {
  value: string
  oneDayDiff?: string
}

type Stats = {
  marketCap: Stat
  price: Stat
  totalLocked: Stat
  totalOrders: Stat
  filledOrders: Stat
  uniqueUsers: Stat
  amountIn: Stat
  recievedAmount: Stat
}

type CachedData = {
  key: string
  date: Moment
  value: any
}

const cachedData: CachedData[] = []

const getCachedPercentage24h = (
  key: string,
  value: string
): string | undefined => {
  const nowDate = moment().startOf('hour').subtract(1, 'day').unix()
  const match = cachedData
    .filter((d) => d.key === key)
    .find((data) => data.date.unix() === nowDate)

  if (match) {
    const cachedValue = new Decimal(match.value)
    const currentValue = new Decimal(value)

    const result = currentValue
      .sub(cachedValue)
      .div(currentValue)
      .mul(100)
      .toDecimalPlaces(2)

    const prefix = result.gte(0) ? '+' : ''
    return `${prefix}${result.toString()}%`
  }
}

const setCachedData = (key: string, value: any) => {
  cachedData.push({
    key,
    value: new Decimal(value).toString(),
    date: moment().startOf('hour'),
  })
}

type Order = any

const getPrefix = (value: number) => (value > 0 ? '+' : '')
const getBigNumber = (value: string) =>
  new Decimal(value).toDecimalPlaces(0).toNumber().toLocaleString('en-US', {
    minimumFractionDigits: 0,
  })

export const getStats = async (): Promise<Stats> => {
  const [coinData, mateData, orderStatsData] = await Promise.all([
    ApiCache.request('https://api.coingecko.com/api/v3/coins/mate'),
    ApiCache.request('https://usemate.com/api/v1/stats'),
    ApiCache.request('https://usemate.com/api/order-api/stats'),
  ])

  const marketCap = {
    value: '$' + getBigNumber(mateData.marketCap),
    oneDayDiff:
      getPrefix(coinData.market_data.market_cap_change_percentage_24h) +
      new Decimal(
        coinData.market_data.market_cap_change_percentage_24h
      ).toDecimalPlaces(2) +
      '%',
  }
  const price = {
    value: '$' + coinData.market_data.current_price.usd,
    oneDayDiff:
      getPrefix(coinData.market_data.price_change_percentage_24h) +
      new Decimal(
        coinData.market_data.price_change_percentage_24h
      ).toDecimalPlaces(2) +
      '%',
  }

  let done = false
  let first = 1000
  let skip = 0

  const whileGenerator = function* () {
    while (!done) {
      yield skip
    }
  }

  let orders: Order[] = []

  for (let i of whileGenerator()) {
    const data = await ApiCache.graphqlRequest(
      'https://api.thegraph.com/subgraphs/name/usemate/mate',
      ordersQuery,
      {
        first,
        skip,
      }
    )

    skip += first
    orders = [...orders, ...data.orders]
    if (data.orders.length === 0) {
      done = true
    }
  }

  orders = orders.map((order) => ({
    ...order,
    executed:
      order.executedTimestamp && moment(Number(order.executedTimestamp) * 1000),
    created:
      order.createdTimestamp && moment(Number(order.createdTimestamp) * 1000),
  }))

  const executedOrders = orders.filter(
    (order) => order.status === 'Closed' && order.executed
  )

  const getUsersCount = (items: Order[]) =>
    [...new Set(items.map((item) => item.creator.toLowerCase()))].length
  const oneDayAgo = moment().subtract(1, 'day')
  const getOrdersLast24Hour = (field: string) => (order: Order) =>
    order[field] && (order[field] as Moment).isAfter(oneDayAgo)

  const filledOrders = {
    value: executedOrders.length.toString(),
    oneDayDiff:
      '+' + executedOrders.filter(getOrdersLast24Hour('executed')).length,
  }

  const totalOrders24H = orders.filter(getOrdersLast24Hour('created'))
  const totalOrders = {
    value: orders.length.toString(),
    oneDayDiff: '+' + totalOrders24H.length,
  }

  const uniqueUsers = {
    value: getUsersCount(orders).toString(),
    oneDayDiff: '+' + getUsersCount(totalOrders24H).toString(),
  }

  if (orderStatsData.executed.amountIn) {
    setCachedData('amountIn', orderStatsData.executed.amountIn)
  }

  if (orderStatsData.executed.recievedAmount) {
    setCachedData('recievedAmount', orderStatsData.executed.recievedAmount)
  }

  if (orderStatsData.totalLocked) {
    setCachedData('totalLocked', orderStatsData.totalLocked)
  }

  const totalLocked = {
    value: '$' + getBigNumber(orderStatsData.totalLocked),
    oneDayDiff: getCachedPercentage24h(
      'totalLocked',
      orderStatsData.totalLocked
    ),
  }

  const amountIn = {
    value: '$' + getBigNumber(orderStatsData.executed.amountIn),
    oneDayDiff: getCachedPercentage24h(
      'amountIn',
      orderStatsData.executed.amountIn
    ),
  }

  const recievedAmount = {
    value: '$' + getBigNumber(orderStatsData.executed.recievedAmount),
    oneDayDiff: getCachedPercentage24h(
      'recievedAmount',
      orderStatsData.executed.recievedAmount
    ),
  }

  return {
    marketCap,
    price,
    totalLocked,
    uniqueUsers,
    filledOrders,
    totalOrders,
    recievedAmount,
    amountIn,
  }
}
