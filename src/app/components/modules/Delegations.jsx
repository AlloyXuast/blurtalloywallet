/* eslint react/prop-types: 0 */
import React from 'react';
import { connect } from 'react-redux';
import tt from 'counterpart';
import WalletSubMenu from 'app/components/elements/WalletSubMenu';
import ConfirmDelegationTransfer from 'app/components/elements/ConfirmDelegationTransfer';
import shouldComponentUpdate from 'app/utils/shouldComponentUpdate';
import * as userActions from 'app/redux/UserReducer';
import * as transactionActions from 'app/redux/TransactionReducer';
import * as appActions from 'app/redux/AppReducer';
import LoadingIndicator from 'app/components/elements/LoadingIndicator';
import TimeAgoWrapper from 'app/components/elements/TimeAgoWrapper';

class Delegations extends React.Component {
    constructor() {
        super();
        this.shouldComponentUpdate = shouldComponentUpdate(this, 'Delegations');
    }

    componentWillMount() {
        const { props } = this;
        props.vestingDelegationsLoading(true);
        props.expiringVestingDelegationsLoading(true);
        props.incomingVestingDelegationsLoading(true);
        props.getVestingDelegations(props.account.get('name'), (err, res) => {
            props.setVestingDelegations(res);
            props.vestingDelegationsLoading(false);
        });
        props.getExpiringVestingDelegations(
            props.account.get('name'),
            (err, res) => {
                props.setExpiringVestingDelegations(res);
                props.expiringVestingDelegationsLoading(false);
            }
        );
        props.getIncomingVestingDelegations(
            props.account.get('name'),
            (err, res) => {
                props.setIncomingVestingDelegations(res);
                props.incomingVestingDelegationsLoading(false);
            }
        );
    }

    render() {
        const {
            account,
            currentUser,
            vestingDelegations,
            expiringVestingDelegations,
            incomingVestingDelegations,
            totalVestingFund,
            totalVestingShares,
            vestingDelegationsPending,
            expiringVestingDelegationsPending,
            incomingVestingDelegationsPending,
            revokeDelegation,
            getVestingDelegations,
            getExpiringVestingDelegations,
            getIncomingVestingDelegations,
            setVestingDelegations,
            setExpiringVestingDelegations,
            setIncomingVestingDelegations,
            vestingDelegationsLoading,
            expiringVestingDelegationsLoading,
            incomingVestingDelegationsLoading,
            operationFlatFee,
            bandwidthKbytesFee,
        } = this.props;

        const convertVestsToBlurt = (vests) => {
            return ((vests * totalVestingFund) / totalVestingShares).toFixed(3);
        };

        const isMyAccount =
            currentUser && currentUser.get('username') === account.get('name');
        // do not render if account is not loaded or available
        if (!account) return null;

        // do not render if state appears to contain only lite account info
        if (!account.has('vesting_shares')) return null;
        const showTransferHandler = (delegatee) => {
            const refetchCB = () => {
                vestingDelegationsLoading(true);
                expiringVestingDelegationsLoading(true);
                incomingVestingDelegationsLoading(true);
                getVestingDelegations(
                    this.props.account.get('name'),
                    (err, res) => {
                        setVestingDelegations(res);
                        vestingDelegationsLoading(false);
                    }
                );
                getExpiringVestingDelegations(
                    this.props.account.get('name'),
                    (err, res) => {
                        setExpiringVestingDelegations(res);
                        expiringVestingDelegationsLoading(false);
                    }
                );
                getIncomingVestingDelegations(
                    this.props.account.get('name'),
                    (err, res) => {
                        setIncomingVestingDelegations(res);
                        incomingVestingDelegationsLoading(false);
                    }
                );
            };
            revokeDelegation(
                this.props.account.get('name'),
                delegatee,
                refetchCB,
                operationFlatFee,
                bandwidthKbytesFee
            );
        };

        const outgoing_delegation_log = vestingDelegations ? (
            vestingDelegations.map((item) => {
                const vestsAsBlurt = convertVestsToBlurt(
                    parseFloat(item.vesting_shares)
                );
                return (
                    <tr
                        key={`${item.delegator}--${item.delegatee}--${item.min_delegation_time}`}
                    >
                        <td className="red">{vestsAsBlurt} BP</td>

                        <td>{item.delegatee}</td>
                        <td>
                            <TimeAgoWrapper date={item.min_delegation_time} />
                        </td>
                        <td>
                            {isMyAccount && (
                                <button
                                    className="delegations__revoke button hollow"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        showTransferHandler(item.delegatee);
                                    }}
                                    type="button"
                                >
                                    {' '}
                                    {tt('delegations_jsx.revoke')}{' '}
                                </button>
                            )}
                        </td>
                    </tr>
                );
            })
        ) : (
            <tr>
                <td>No Outgoing Delegations Found</td>
            </tr>
        );

        const expiring_delegation_log = expiringVestingDelegations ? (
            expiringVestingDelegations.map((item) => {
                const vestsAsBlurt = convertVestsToBlurt(
                    parseFloat(item.vesting_shares)
                );
                return (
                    <tr
                        key={`${item.delegator}--${item.expiration.replace(
                            ' ',
                            'T'
                        )}`}
                    >
                        <td className="red">{vestsAsBlurt} BP</td>
                        <td />
                        <td>{item.expiration.replace('T', ' ')}</td>
                        <td />
                    </tr>
                );
            })
        ) : (
            <tr>
                <td>No Expiring Delegations Found</td>
            </tr>
        );

        const incoming_delegation_log = incomingVestingDelegations ? (
            incomingVestingDelegations.map((item) => {
                const vestsAsBlurt = convertVestsToBlurt(
                    parseFloat(item.vesting_shares)
                );
                return (
                    <tr
                        key={`${item.delegator}--${item.delegatee}--${item.min_delegation_time}`}
                    >
                        <td className="red">{vestsAsBlurt} BP</td>

                        <td>{item.delegator}</td>
                        <td>
                            <TimeAgoWrapper date={item.min_delegation_time} />
                        </td>
                        <td />
                    </tr>
                );
            })
        ) : (
            <tr>
                <td>No Incoming Delegations Found</td>
            </tr>
        );

        return (
            <div className="UserWallet">
                <div className="row">
                    <div className="columns small-10 medium-12 medium-expand">
                        <WalletSubMenu
                            accountname={account.get('name')}
                            isMyAccount={isMyAccount}
                        />
                    </div>
                </div>
                <div className="row">
                    <div className="column small-12">
                        <h4>{tt('delegations_jsx.outgoing_delegations')}</h4>
                        {vestingDelegationsPending && (
                            <LoadingIndicator type="circle" />
                        )}
                        <table>
                            {!!vestingDelegations && (
                                <thead>
                                    <tr>
                                        <th>{tt('delegations_jsx.amount')}</th>
                                        <th>
                                            {tt('delegations_jsx.recipient')}
                                        </th>
                                        <th>
                                            {tt(
                                                'delegations_jsx.delegation_start_time'
                                            )}
                                        </th>
                                        <th />
                                    </tr>
                                </thead>
                            )}
                            <tbody>{outgoing_delegation_log}</tbody>
                        </table>
                    </div>
                </div>
                <div className="row">
                    <div className="column small-12">
                        <h4>{tt('delegations_jsx.expiring_delegations')}</h4>
                        {expiringVestingDelegationsPending && (
                            <LoadingIndicator type="circle" />
                        )}
                        <table>
                            {!!expiringVestingDelegations && (
                                <thead>
                                    <tr>
                                        <th>{tt('delegations_jsx.amount')}</th>
                                        <th />
                                        <th>
                                            {tt('delegations_jsx.expiration')}
                                        </th>
                                        <th />
                                    </tr>
                                </thead>
                            )}
                            <tbody>{expiring_delegation_log}</tbody>
                        </table>
                    </div>
                </div>
                <div className="row">
                    <div className="column small-12">
                        <h4>{tt('delegations_jsx.incoming_delegations')}</h4>
                        {incomingVestingDelegationsPending && (
                            <LoadingIndicator type="circle" />
                        )}
                        <table>
                            {!!incomingVestingDelegations && (
                                <thead>
                                    <tr>
                                        <th>{tt('delegations_jsx.amount')}</th>
                                        <th>
                                            {tt('delegations_jsx.delegator')}
                                        </th>
                                        <th>
                                            {tt(
                                                'delegations_jsx.delegation_start_time'
                                            )}
                                        </th>
                                        <th />
                                    </tr>
                                </thead>
                            )}
                            <tbody>{incoming_delegation_log}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }
}
export default connect(
    // mapStateToProps
    (state, ownProps) => {
        const vestingDelegations = state.user.get('vestingDelegations');
        const expiringVestingDelegations = state.user.get(
            'expiringVestingDelegations'
        );
        const incomingVestingDelegations = state.user.get(
            'incomingVestingDelegations'
        );

        const vestingDelegationsPending = state.user.get(
            'vestingDelegationsLoading'
        );
        const expiringVestingDelegationsPending = state.user.get(
            'expiringVestingDelegationsLoading'
        );
        const incomingVestingDelegationsPending = state.user.get(
            'incomingVestingDelegationsLoading'
        );

        const totalVestingShares = state.global.getIn([
            'props',
            'total_vesting_shares',
        ])
            ? parseFloat(
                  state.global
                      .getIn(['props', 'total_vesting_shares'])
                      .split(' ')[0]
              )
            : 0;

        const totalVestingFund = state.global.getIn([
            'props',
            'total_vesting_fund_blurt',
        ])
            ? parseFloat(
                  state.global
                      .getIn(['props', 'total_vesting_fund_blurt'])
                      .split(' ')[0]
              )
            : 0;
        const operationFlatFee = state.global.getIn([
            'props',
            'operation_flat_fee',
        ])
            ? parseFloat(
                  state.global
                      .getIn(['props', 'operation_flat_fee'])
                      .split(' ')[0]
              )
            : 0.001;
        const bandwidthKbytesFee = state.global.getIn([
            'props',
            'bandwidth_kbytes_fee',
        ])
            ? parseFloat(
                  state.global
                      .getIn(['props', 'bandwidth_kbytes_fee'])
                      .split(' ')[0]
              )
            : 0.1;
        return {
            ...ownProps,
            vestingDelegations,
            expiringVestingDelegations,
            incomingVestingDelegations,
            totalVestingShares,
            totalVestingFund,
            vestingDelegationsPending,
            expiringVestingDelegationsPending,
            incomingVestingDelegationsPending,
            operationFlatFee,
            bandwidthKbytesFee,
        };
    },
    // mapDispatchToProps
    (dispatch) => ({
        getVestingDelegations: (account, successCallback) => {
            dispatch(
                userActions.getVestingDelegations({ account, successCallback })
            );
        },
        getExpiringVestingDelegations: (account, successCallback) => {
            dispatch(
                userActions.getExpiringVestingDelegations({
                    account,
                    successCallback,
                })
            );
        },
        getIncomingVestingDelegations: (account, successCallback) => {
            dispatch(
                userActions.getIncomingVestingDelegations({
                    account,
                    successCallback,
                })
            );
        },

        setVestingDelegations: (payload) => {
            dispatch(userActions.setVestingDelegations(payload));
        },
        setExpiringVestingDelegations: (payload) => {
            dispatch(userActions.setExpiringVestingDelegations(payload));
        },
        setIncomingVestingDelegations: (payload) => {
            dispatch(userActions.setIncomingVestingDelegations(payload));
        },

        vestingDelegationsLoading: (payload) => {
            dispatch(userActions.vestingDelegationsLoading(payload));
        },
        expiringVestingDelegationsLoading: (payload) => {
            dispatch(userActions.expiringVestingDelegationsLoading(payload));
        },
        incomingVestingDelegationsLoading: (payload) => {
            dispatch(userActions.incomingVestingDelegationsLoading(payload));
        },

        revokeDelegation: (
            username,
            to,
            refetchDelegations,
            operationFlatFee,
            bandwidthKbytesFee
        ) => {
            const vests = parseFloat(0, 10).toFixed(6);

            const operation = {
                delegator: username,
                delegatee: to,
                // Revoke is always 0
                vesting_shares: `${vests} VESTS`,
            };
            // Calculate transaction fee
            const size = JSON.stringify(operation).replace(
                /[\[\]\,\"]/g,
                ''
            ).length;
            const bw_fee = Math.max(
                0.001,
                ((size / 1024) * bandwidthKbytesFee).toFixed(3)
            );
            const fee = operationFlatFee + bw_fee;

            const confirm = () => (
                <ConfirmDelegationTransfer
                    operation={operation}
                    amount={0.0}
                    fee={fee}
                />
            );

            const transactionType = 'delegate_vesting_shares';
            const successCallback = () => {
                dispatch(
                    appActions.addNotification({
                        key: 'Revoke Delegation',
                        message: 'Delegation Successfully Revoked.',
                    })
                );
                refetchDelegations();
            };
            const errorCallback = () => {
                dispatch(
                    appActions.addNotification({
                        key: 'Revoke Delegation',
                        message: 'Delegation failed to revoke.',
                    })
                );
            };

            dispatch(
                transactionActions.broadcastOperation({
                    type: transactionType,
                    operation,
                    successCallback,
                    errorCallback,
                    confirm,
                })
            );
        },
    })
)(Delegations);
