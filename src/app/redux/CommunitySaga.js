import { call, put, takeLatest, select } from 'redux-saga/effects'
import { api, broadcast, auth } from '@blurtfoundation/blurtjs'
import { PrivateKey } from '@blurtfoundation/blurtjs/lib/auth/ecc'
import * as communityActions from './CommunityReducer'
import * as transactionActions from './TransactionReducer'

const activeKeySelector = (state) => {
  return state.user.getIn(['pub_keys_used']).active
}

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(), ms)
  })

const generateAuth = (user, pass, type) => {
  const key = auth.getPrivateKeys(user, pass, [type])
  const publicKey = auth.wifToPublic(Object.values(key)[0])
  if (type == 'memo') return publicKey
  return {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[publicKey, 1]]
  }
}

const generateBlurtmindOperation = (actor_name, action, params) => {
  return [
    'custom_json',
    {
      required_auths: [],
      required_posting_auths: [actor_name],
      id: 'community',
      json: JSON.stringify([action, params])
    }
  ]
}

export const communityWatches = [
  takeLatest(
    communityActions.CREATE_COMMUNITY_ACCOUNT,
    createCommunityAccount
  ),
  takeLatest(communityActions.COMMUNITY_BLURTMIND_OPERATION, customOps)
]

export function * customOps (action) {
  yield put({
    type: communityActions.CREATE_COMMUNITY_ACCOUNT_PENDING,
    payload: true
  })
  const {
    accountName,
    communityTitle,
    communityDescription,
    communityOwnerName,
    communityOwnerWifPassword,
    createAccountSuccessCB,
    createAccountErrorCB,
    broadcastOpsErrorCB
  } = action.payload

  // wait 3s for account creation to settle
  yield call(wait, 3000)

  try {
    const communityOwnerPosting = auth.getPrivateKeys(
      communityOwnerName,
      communityOwnerWifPassword,
      ['posting']
    )

    const setRoleOperation = generateBlurtmindOperation(
      communityOwnerName,
      'setRole',
      {
        community: communityOwnerName,
        account: accountName,
        role: 'admin'
      }
    )

    const updatePropsOperation = generateBlurtmindOperation(
      communityOwnerName,
      'updateProps',
      {
        community: communityOwnerName,
        props: {
          title: communityTitle,
          about: communityDescription
        }
      }
    )

    const subscribeToCommunityOperation = generateBlurtmindOperation(
      accountName,
      'subscribe',
      {
        community: communityOwnerName
      }
    )

    yield broadcast.sendAsync(
      {
        extensions: [],
        operations: [setRoleOperation, updatePropsOperation]
      },
      [
        auth.toWif(
          communityOwnerName,
          communityOwnerWifPassword,
          'posting'
        )
      ]
    )

    // subscription op must be broadcast from logged in user
    yield put(
      transactionActions.broadcastOperation({
        type: subscribeToCommunityOperation[0],
        operation: subscribeToCommunityOperation[1],
        successCallback: (res) => {
          console.log('subscribed')
        },
        errorCallback: (res) => {
          console.log('subscribe error', res)
        }
      })
    )

    // wait a few blocks for blurtmind to index ops before alerting user
    yield call(wait, 6000)

    yield put({
      type: communityActions.CREATE_COMMUNITY_SUCCESS,
      payload: true
    })
  } catch (error) {
    console.log(error)
    broadcastOpsErrorCB()
    yield put({
      type: communityActions.CREATE_COMMUNITY_ACCOUNT_ERROR,
      payload: true
    })
  }
  yield put({
    type: communityActions.CREATE_COMMUNITY_ACCOUNT_PENDING,
    payload: false
  })
}

export function * createCommunityAccount (createCommunityAction) {
  yield put({
    type: communityActions.CREATE_COMMUNITY_ACCOUNT_PENDING,
    payload: true
  })
  const {
    accountName,
    communityTitle,
    communityDescription,
    communityOwnerName,
    communityOwnerWifPassword,
    broadcastOpsCb,
    createAccountSuccessCB,
    createAccountErrorCB,
    broadcastOpsErrorCB
  } = createCommunityAction.payload

  const communityOwnerPosting = auth.getPrivateKeys(
    communityOwnerName,
    communityOwnerWifPassword,
    ['posting']
  )
  try {
    const op = {
      fee: '10.000 BLURT',
      creator: accountName,
      new_account_name: communityOwnerName,
      owner: generateAuth(
        communityOwnerName,
        communityOwnerWifPassword,
        'owner'
      ),
      active: generateAuth(
        communityOwnerName,
        communityOwnerWifPassword,
        'active'
      ),
      posting: generateAuth(
        communityOwnerName,
        communityOwnerWifPassword,
        'posting'
      ),
      memo_key: generateAuth(
        communityOwnerPosting,
        communityOwnerWifPassword,
        'memo'
      ),
      json_metadata: ''
    }

    yield put(
      transactionActions.broadcastOperation({
        type: 'account_create',
        confirm:
                    'This operation will cost 10 BLURT. Would you like to proceed?',
        operation: op,
        successCallback: (res) => {
          createAccountSuccessCB()
          broadcastOpsCb()
        },
        errorCallback: (res) => {
          console.log('error', res)
          createAccountErrorCB(res)
        }
      })
    )
  } catch (error) {
    console.log(error)
    yield put({
      type: communityActions.CREATE_COMMUNITY_ACCOUNT_ERROR,
      payload: true
    })
    yield put({
      type: communityActions.CREATE_COMMUNITY_ACCOUNT_PENDING,
      payload: false
    })
  }
}
