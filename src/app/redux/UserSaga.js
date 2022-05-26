import { fromJS, Set, List } from 'immutable';
import { call, put, select, fork, takeLatest } from 'redux-saga/effects';
import { api } from '@blurtfoundation/blurtjs';
import {
    PrivateKey,
    Signature,
    hash,
} from '@blurtfoundation/blurtjs/lib/auth/ecc';

import { accountAuthLookup } from 'app/redux/AuthSaga';
import { getAccount } from 'app/redux/SagaShared';
import * as userActions from 'app/redux/UserReducer';
import { receiveFeatureFlags } from 'app/redux/AppReducer';
import {
    hasCompatibleKeychain,
    isLoggedInWithKeychain,
} from 'app/utils/BlurtKeychain';
import { packLoginData, extractLoginData } from 'app/utils/UserUtil';
import { browserHistory } from 'react-router';
import {
    serverApiLogin,
    serverApiLogout,
    serverApiRecordEvent,
    //    isTosAccepted,
    acceptTos,
} from 'app/utils/ServerApiClient';
import { loadFollows } from 'app/redux/FollowSaga';
import { translate } from 'app/Translator';

export const userWatches = [
    takeLatest('@@router/LOCATION_CHANGE', removeHighSecurityKeys), // keep first to remove keys early when a page change happens
    takeLatest(
        'user/lookupPreviousOwnerAuthority',
        lookupPreviousOwnerAuthority
    ),
    takeLatest(userActions.USERNAME_PASSWORD_LOGIN, usernamePasswordLogin),
    takeLatest(userActions.SAVE_LOGIN, saveLogin_localStorage),
    takeLatest(userActions.LOGOUT, logout),
    takeLatest(userActions.GET_VESTING_DELEGATIONS, getVestingDelegationsSaga),
    takeLatest(
        userActions.GET_EXPIRING_VESTING_DELEGATIONS,
        getExpiringVestingDelegationsSaga
    ),
    takeLatest(
        userActions.GET_INCOMING_VESTING_DELEGATIONS,
        getIncomingVestingDelegationsSaga
    ),
    takeLatest(userActions.LOGIN_ERROR, loginError),
    takeLatest(userActions.LOAD_SAVINGS_WITHDRAW, loadSavingsWithdraw),
    takeLatest(userActions.UPLOAD_IMAGE, uploadImage),
    takeLatest(userActions.ACCEPT_TERMS, function* () {
        try {
            yield call(acceptTos);
        } catch (e) {
            // TODO: log error to server, conveyor is unavailable
        }
    }),
    function* getLatestFeedPrice() {
        try {
            const history = yield call([api, api.getFeedHistoryAsync]);
            const feed = history.price_history;
            const last = fromJS(feed[feed.length - 1]);
            yield put(userActions.setLatestFeedPrice(last));
        } catch (error) {
            // (exceedingly rare) ignore, UI will fall back to feed_price
        }
    },
];

const highSecurityPages = [
    /\/market/,
    /\/@.+\/(transfers|permissions|password|communities|delegations)/,
    /\/~witnesses/,
    /\/proposals/,
];
function* getVestingDelegationsSaga(action) {
    try {
        const vestingDelegations = yield call(
            [api, api.getVestingDelegations],
            action.payload.account,
            '',
            100,
            action.payload.successCallback
        );
    } catch (error) {}
}

function* getExpiringVestingDelegationsSaga(action) {
    const now = new Date();
    const timestamp = now.toISOString().replace('Z', '');
    try {
        const expiringVestingDelegations = yield call(
            [api, api.getExpiringVestingDelegations],
            action.payload.account,
            timestamp,
            action.payload.successCallback
        );
    } catch (error) {}
}

function* getIncomingVestingDelegationsSaga(action) {
    try {
        const incomingVestingDelegations = yield call(
            [api, api.getIncomingVestingDelegations],
            action.payload.account,
            '',
            1000,
            action.payload.successCallback
        );
    } catch (error) {}
}

function* loadSavingsWithdraw() {
    const username = yield select((state) =>
        state.user.getIn(['current', 'username'])
    );
    const to = yield call([api, api.getSavingsWithdrawToAsync], username);
    const fro = yield call([api, api.getSavingsWithdrawFromAsync], username);

    const m = {};
    for (const v of to) m[v.id] = v;
    for (const v of fro) m[v.id] = v;

    const withdraws = List(fromJS(m).values()).sort((a, b) =>
        strCmp(a.get('complete'), b.get('complete'))
    );

    yield put(
        userActions.set({
            key: 'savings_withdraws',
            value: withdraws,
        })
    );
}

const strCmp = (a, b) => (a > b ? 1 : a < b ? -1 : 0);

function* removeHighSecurityKeys({ payload: { pathname } }) {
    const highSecurityPage =
        highSecurityPages.find((p) => p.test(pathname)) != null;
    // Let the user keep the active key when going from one high security page to another.  This helps when
    // the user logins into the Wallet then the Permissions tab appears (it was hidden).  This keeps them
    // from getting logged out when they click on Permissions (which is really bad because that tab
    // disappears again).
    if (!highSecurityPage) yield put(userActions.removeHighSecurityKeys());
}

const clean = (value) =>
    value == null || value === '' || /null|undefined/.test(value)
        ? undefined
        : value;

/**
    @arg {object} action.username - Unless a WIF is provided, this is hashed with the password and key_type to create private keys.
    @arg {object} action.password - Password or WIF private key.  A WIF becomes the posting key, a password can create all three
        key_types: active, owner, posting keys.
*/
function* usernamePasswordLogin({
    payload: {
        username,
        password,
        useKeychain,
        saveLogin,
        operationType /* high security */,
    },
}) {
    const current = yield select((state) => state.user.get('current'));
    if (current) {
        const currentUsername = current.get('username');
        yield fork(loadFollows, currentUsername, 'blog');
        yield fork(loadFollows, currentUsername, 'ignore');
    }

    const user = yield select((state) => state.user);
    const loginType = user.get('login_type');
    const justLoggedIn = loginType === 'basic';
    console.log(
        'Login type:',
        loginType,
        'Operation type:',
        operationType,
        'Just logged in?',
        justLoggedIn,
        'username:',
        username
    );

    // login, using saved password
    let autopost,
        memoWif,
        login_owner_pubkey,
        login_wif_owner_pubkey,
        login_with_keychain;
    if (!username && !password) {
        const data = localStorage.getItem('autopost2');
        if (data) {
            // auto-login with a low security key (like a posting key)
            autopost = true; // must use simi-colon
            // The 'password' in this case must be the posting private wif .. See setItme('autopost')
            [
                username,
                password,
                memoWif,
                login_owner_pubkey,
                login_with_keychain,
            ] = extractLoginData(data);
            memoWif = clean(memoWif);
            login_owner_pubkey = clean(login_owner_pubkey);
        }
    }
    // no saved password
    if (!username || !(password || useKeychain || login_with_keychain)) {
        console.log('No saved password');
        const offchain_account = yield select((state) =>
            state.offchain.get('account')
        );
        if (offchain_account) serverApiLogout();
        return;
    }

    let userProvidedRole; // login via:  username/owner
    if (username.indexOf('/') > -1) {
        // "alice/active" will login only with Alices active key
        [username, userProvidedRole] = username.split('/');
    }

    const isRole = (role, fn) =>
        !userProvidedRole || role === userProvidedRole ? fn() : undefined;

    const account = yield call(getAccount, username);
    if (!account) {
        console.log('No account');
        yield put(userActions.loginError({ error: 'Username does not exist' }));
        return;
    }

    // return if already logged in using steem keychain
    if (login_with_keychain) {
        console.log('Logged in using steem keychain');
        yield put(
            userActions.setUser({
                username,
                login_with_keychain: true,
                vesting_shares: account.get('vesting_shares'),
                received_vesting_shares: account.get('received_vesting_shares'),
                delegated_vesting_shares: account.get(
                    'delegated_vesting_shares'
                ),
            })
        );
        return;
    }

    let private_keys;
    if (!useKeychain) {
        try {
            const private_key = PrivateKey.fromWif(password);
            login_wif_owner_pubkey = private_key.toPublicKey().toString();
            private_keys = fromJS({
                posting_private: isRole('posting', () => private_key),
                active_private: isRole('active', () => private_key),
                owner_private: isRole('owner', () => private_key),
                memo_private: private_key,
            });
        } catch (e) {
            // Password (non wif)
            login_owner_pubkey = PrivateKey.fromSeed(
                username + 'owner' + password
            )
                .toPublicKey()
                .toString();
            private_keys = fromJS({
                posting_private: isRole('posting', () =>
                    PrivateKey.fromSeed(username + 'posting' + password)
                ),
                active_private: isRole('active', () =>
                    PrivateKey.fromSeed(username + 'active' + password)
                ),
                owner_private: isRole('owner', () =>
                    PrivateKey.fromSeed(username + 'owner' + password)
                ),
                memo_private: PrivateKey.fromSeed(username + 'memo' + password),
            });
        }
        if (memoWif) {
            private_keys = private_keys.set(
                'memo_private',
                PrivateKey.fromWif(memoWif)
            );
        }

        yield call(accountAuthLookup, {
            payload: {
                account,
                private_keys,
                login_owner_pubkey,
            },
        });
        const authority = yield select((state) =>
            state.user.getIn(['authority', username])
        );

        const fullAuths = authority.reduce(
            (r, auth, type) => (auth === 'full' ? r.add(type) : r),
            Set()
        );
        if (!fullAuths.size) {
            console.log('No full auths');
            localStorage.removeItem('autopost2');
            const generated_type = password[0] === 'P' && password.length > 40;
            const owner_pub_key = account.getIn(['owner', 'key_auths', 0, 0]);
            serverApiRecordEvent(
                'login_attempt',
                JSON.stringify({
                    name: username,
                    login_owner_pubkey,
                    owner_pub_key,
                    generated_type,
                })
            );
            yield put(userActions.loginError({ error: 'Incorrect Password' }));
            return;
        }

        if (authority.get('posting') !== 'full') {
            private_keys = private_keys.remove('posting_private');
        }
        if (authority.get('active') !== 'full') {
            private_keys = private_keys.remove('active_private');
        }
        if (authority.get('owner') !== 'full') {
            private_keys = private_keys.remove('owner_private');
        }
        if (authority.get('memo') !== 'full') {
            private_keys = private_keys.remove('memo_private');
        }

        // If user is signing operation by operaion and has no saved login, don't save to RAM
        if (!operationType || saveLogin) {
            // Keep the posting key in RAM but only when not signing an operation.
            // No operation or the user has checked: Keep me logged in...
            yield put(
                userActions.setUser({
                    username,
                    private_keys,
                    login_owner_pubkey,
                    vesting_shares: account.get('vesting_shares'),
                    received_vesting_shares: account.get(
                        'received_vesting_shares'
                    ),
                    delegated_vesting_shares: account.get(
                        'delegated_vesting_shares'
                    ),
                })
            );
        } else {
            yield put(
                userActions.setUser({
                    username,
                    vesting_shares: account.get('vesting_shares'),
                    received_vesting_shares: account.get(
                        'received_vesting_shares'
                    ),
                    delegated_vesting_shares: account.get(
                        'delegated_vesting_shares'
                    ),
                })
            );
        }
    }

    try {
        // const challengeString = yield serverApiLoginChallenge()
        const offchainData = yield select((state) => state.offchain);
        const serverAccount = offchainData.get('account');
        const challengeString = offchainData.get('login_challenge');
        if (!serverAccount && challengeString) {
            console.log('No server account, but challenge string');
            const signatures = {};
            const challenge = { token: challengeString };
            const buf = JSON.stringify(challenge, null, 0);
            const bufSha = hash.sha256(buf);
            if (useKeychain) {
                const response = yield new Promise((resolve) => {
                    window.blurt_keychain.requestSignBuffer(
                        username,
                        buf,
                        'Posting',
                        (response) => {
                            resolve(response);
                        }
                    );
                });
                if (response.success) {
                    signatures.posting = response.result;
                } else {
                    yield put(
                        userActions.loginError({ error: response.message })
                    );
                    return;
                }
                yield put(
                    userActions.setUser({
                        username,
                        login_with_keychain: true,
                        vesting_shares: account.get('vesting_shares'),
                        received_vesting_shares: account.get(
                            'received_vesting_shares'
                        ),
                        delegated_vesting_shares: account.get(
                            'delegated_vesting_shares'
                        ),
                    })
                );
            } else {
                const sign = (role, d) => {
                    console.log('Sign before');
                    if (!d) return;
                    console.log('Sign after');
                    const sig = Signature.signBufferSha256(bufSha, d);
                    signatures[role] = sig.toHex();
                };
                sign('posting', private_keys.get('posting_private'));
                // sign('active', private_keys.get('active_private'))
            }

            console.log('Logging in as', username);
            const response = yield serverApiLogin(username, signatures);
            const body = yield response.json();
        }
    } catch (error) {
        // Does not need to be fatal
        console.error('Server Login Error', error);
    }

    if (!autopost && saveLogin) yield put(userActions.saveLogin());

    /*
    // Feature Flags
    if (useKeychain || private_keys.get('posting_private')) {
        yield fork(
            getFeatureFlags,
            username,
            useKeychain ? null : private_keys.get('posting_private').toString()
        );
    }
    */

    // TOS acceptance
    //    yield fork(promptTosAcceptance, username);
}
/*
function* promptTosAcceptance(username) {
    try {
        const accepted = yield call(isTosAccepted, username);
        if (!accepted) {
            yield put(userActions.showTerms());
        }
    } catch (e) {
        // TODO: log error to server, conveyor is unavailable
    }
}
*/
function* getFeatureFlags(username, posting_private) {
    try {
        let flags;
        if (!posting_private && hasCompatibleKeychain()) {
            flags = yield new Promise((resolve, reject) => {
                window.blurt_keychain.requestSignedCall(
                    username,
                    'conveyor.get_feature_flags',
                    { account: username },
                    'posting',
                    (response) => {
                        if (!response.success) {
                            reject(response.message);
                        } else {
                            resolve(response.result);
                        }
                    }
                );
            });
        } else {
            const flags = yield call(
                [api, api.signedCallAsync],
                'conveyor.get_feature_flags',
                { account: username },
                username,
                posting_private
            );
        }
        yield put(receiveFeatureFlags(flags));
    } catch (error) {
        // Do nothing; feature flags are not ready yet. Or posting_private is not available.
    }
}

function* saveLogin_localStorage() {
    if (!process.env.BROWSER) {
        console.error('Non-browser environment, skipping localstorage');
        return;
    }
    localStorage.removeItem('autopost2');
    const [username, private_keys, login_owner_pubkey, login_with_keychain] =
        yield select((state) => [
            state.user.getIn(['current', 'username']),
            state.user.getIn(['current', 'private_keys']),
            state.user.getIn(['current', 'login_owner_pubkey']),
            state.user.getIn(['current', 'login_with_keychain']),
        ]);
    if (!login_with_keychain && !private_keys) {
        console.info('No private keys. May be a username login.');
        return;
    }
    if (!username) {
        console.error('Not logged in');
        return;
    }
    // Save the lowest security key
    const posting_private = private_keys && private_keys.get('posting_private');
    if (!login_with_keychain && !posting_private) {
        console.error('No posting key to save?');
        return;
    }
    const account = yield select((state) =>
        state.global.getIn(['accounts', username])
    );
    if (!account) {
        console.error('Missing global.accounts[' + username + ']');
        return;
    }
    const postingPubkey = posting_private
        ? posting_private.toPublicKey().toString()
        : 'none';
    try {
        account.getIn(['active', 'key_auths']).forEach((auth) => {
            if (auth.get(0) === postingPubkey) {
                throw 'Login will not be saved, posting key is the same as active key';
            }
        });
        account.getIn(['owner', 'key_auths']).forEach((auth) => {
            if (auth.get(0) === postingPubkey) {
                throw 'Login will not be saved, posting key is the same as owner key';
            }
        });
    } catch (e) {
        console.error(e);
        return;
    }

    const memoKey = private_keys ? private_keys.get('memo_private') : null;
    const memoWif = memoKey && memoKey.toWif();
    const postingPrivateWif = posting_private
        ? posting_private.toWif()
        : 'none';
    const data = packLoginData(
        username,
        postingPrivateWif,
        memoWif,
        login_owner_pubkey,
        login_with_keychain
    );
    // autopost is a auto login for a low security key (like the posting key)
    localStorage.setItem('autopost2', data);
}

function* logout(action) {
    const payload = (action || {}).payload || {};
    const logoutType = payload.type || 'default';
    console.log('Logging out', arguments, 'logout type', logoutType);

    // Just in case it is still showing
    yield put(userActions.saveLoginConfirm(false));

    if (process.env.BROWSER) {
        sessionStorage.removeItem('username');
        localStorage.removeItem('autopost2');
    }

    yield serverApiLogout();
}

function* loginError({
    payload: {
        /* error */
    },
}) {
    serverApiLogout();
}

/**
    If the owner key was changed after the login owner key, this function will find the next owner key history record after the change and store it under user.previous_owner_authority.
*/
function* lookupPreviousOwnerAuthority({ payload: {} }) {
    const current = yield select((state) => state.user.getIn(['current']));
    if (!current) return;

    const login_owner_pubkey = current.get('login_owner_pubkey');
    if (!login_owner_pubkey) return;

    const username = current.get('username');
    const key_auths = yield select((state) =>
        state.global.getIn(['accounts', username, 'owner', 'key_auths'])
    );
    if (
        key_auths &&
        key_auths.find((key) => key.get(0) === login_owner_pubkey)
    ) {
        // console.log('UserSaga ---> Login matches current account owner');
        return;
    }
    // Owner history since this index was installed July 14
    let owner_history = fromJS(
        yield call([api, api.getOwnerHistoryAsync], username)
    );
    if (owner_history.count() === 0) return;
    owner_history = owner_history.sort((b, a) => {
        // sort decending
        const aa = a.get('last_valid_time');
        const bb = b.get('last_valid_time');
        return aa < bb ? -1 : aa > bb ? 1 : 0;
    });
    // console.log('UserSaga ---> owner_history', owner_history.toJS())
    const previous_owner_authority = owner_history.find((o) => {
        const auth = o.get('previous_owner_authority');
        const weight_threshold = auth.get('weight_threshold');
        const key3 = auth
            .get('key_auths')
            .find(
                (key2) =>
                    key2.get(0) === login_owner_pubkey &&
                    key2.get(1) >= weight_threshold
            );
        return key3 ? auth : null;
    });
    if (!previous_owner_authority) {
        console.log('UserSaga ---> Login owner does not match owner history');
        return;
    }
    // console.log('UserSage ---> previous_owner_authority', previous_owner_authority.toJS())
    yield put(userActions.setUser({ previous_owner_authority }));
}

function* uploadImage({
    payload: { file, dataUrl, filename = 'image.txt', progress },
}) {
    const _progress = progress;
    progress = (msg) => {
        _progress(msg);
    };

    const stateUser = yield select((state) => state.user);
    const username = stateUser.getIn(['current', 'username']);
    const keychainLogin = isLoggedInWithKeychain();
    const d = stateUser.getIn(['current', 'private_keys', 'posting_private']);
    if (!username) {
        progress({ error: 'Please login first.' });
        return;
    }
    if (!(keychainLogin || d)) {
        progress({ error: 'Login with your posting key' });
        return;
    }

    if (!file && !dataUrl) {
        console.error('uploadImage required: file or dataUrl');
        return;
    }

    let data, dataBs64;
    if (file) {
        // drag and drop
        const reader = new FileReader();
        data = yield new Promise((resolve) => {
            reader.addEventListener('load', () => {
                const result = new Buffer(reader.result, 'binary');
                resolve(result);
            });
            reader.readAsBinaryString(file);
        });
    } else {
        // recover from preview
        const commaIdx = dataUrl.indexOf(',');
        dataBs64 = dataUrl.substring(commaIdx + 1);
        data = new Buffer(dataBs64, 'base64');
    }
    // The challenge needs to be prefixed with a constant (both on the server and checked on the client) to make sure the server can't easily make the client sign a transaction doing something else.
    const prefix = new Buffer('ImageSigningChallenge');
    const buf = Buffer.concat([prefix, data]);
    const bufSha = hash.sha256(buf);

    const formData = new FormData();
    if (file) {
        formData.append('file', file);
    } else {
        throw new Error('could not find index of [,]');
        formData.append('filename', filename);
        formData.append('filebase64', dataBs64);
    }

    let sig;
    if (keychainLogin) {
        const response = yield new Promise((resolve) => {
            window.blurt_keychain.requestSignBuffer(
                username,
                JSON.stringify(buf),
                'Posting',
                (response) => {
                    resolve(response);
                }
            );
        });
        if (response.success) {
            sig = response.result;
        } else {
            progress({ error: response.message });
            return;
        }
    } else {
        sig = Signature.signBufferSha256(bufSha, d).toHex();
    }

    const postUrl = `${$STM_Config.upload_image}/${username}/${sig}`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', postUrl);
    xhr.onload = function () {
        console.log(xhr.status, xhr.responseText);
        const res = JSON.parse(xhr.responseText);
        const { error } = res;
        if (error) {
            progress({ error: 'Error: ' + error });
            return;
        }
        const { url } = res;
        progress({ url });
    };
    xhr.onerror = function (error) {
        console.error(filename, error);
        progress({ error: 'Unable to contact the server.' });
    };
    xhr.upload.onprogress = function (event) {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            progress({ message: `Uploading ${percent}%` });
        }
    };
    xhr.send(formData);
}