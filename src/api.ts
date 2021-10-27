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
}

type Order = any

const getPrefix = (value: number) => (value > 0 ? '+' : '')
const getBigNumber = (value: string) =>
  new Decimal(value).toDecimalPlaces(0).toNumber().toLocaleString('en-US', {
    minimumFractionDigits: 0,
  })

export const getStats = async (): Promise<Stats> => {
  const [coinData, mateData] = await Promise.all([
    ApiCache.request('https://api.coingecko.com/api/v3/coins/mate'),
    ApiCache.request('https://usemate.com/api/v1/stats'),
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

  const totalLocked = {
    value: '$' + getBigNumber(mateData.totalLocked),
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
    new Set(items.map((item) => item.creator)).size
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

  return {
    marketCap,
    price,
    totalLocked,
    uniqueUsers,
    filledOrders,
    totalOrders,
  }
}
