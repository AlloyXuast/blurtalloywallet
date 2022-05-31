import React from 'react';
import Moment from 'moment';
import { api } from '@blurtfoundation/blurtjs';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Link } from 'react-router';
import links from 'app/utils/Links';
import Icon from 'app/components/elements/Icon';
import * as transactionActions from 'app/redux/TransactionReducer';
import Userpic from 'app/components/elements/Userpic';
import TimeAgoWrapper from 'app/components/elements/TimeAgoWrapper';
import { formatLargeNumber } from 'app/utils/ParsersAndFormatters';
import ByteBuffer from 'bytebuffer';
import { is, Set, List } from 'immutable';
import * as globalActions from 'app/redux/GlobalReducer';
import { vestsToHpf } from 'app/utils/StateFunctions';
import tt from 'counterpart';
import _ from 'lodash';

const Long = ByteBuffer.Long;
const { string, func, object } = PropTypes;

const DISABLED_SIGNING_KEY = 'BLT1111111111111111111111111111111114T1Anm';

function _blockGap(head_block, last_block) {
    if (!last_block || last_block < 1) return 'forever';
    const secs = (head_block - last_block) * 3;
    if (secs < 60) return 'just now';
    if (secs < 120) return 'recently';
    const mins = Math.floor(secs / 60);
    if (mins < 120) return mins + ' mins ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return hrs + ' hrs ago';
    const days = Math.floor(hrs / 24);
    if (days < 14) return days + ' days ago';
    const weeks = Math.floor(days / 7);
    if (weeks < 104) return weeks + ' weeks ago';
}

class Witnesses extends React.Component {
    static propTypes = {
        // HTML properties

        // Redux connect properties
        witnesses: object.isRequired,
        witness_list: object.isRequired,
        accountWitnessVote: func.isRequired,
        username: string,
        witness_votes: object,
    };

    constructor() {
        super();
        this.state = {
            customUsername: '',
            proxy: '',
            proxyFailed: false,
            witnessAccounts: {},
            witnessToHighlight: '',
            filterEnabledWitness: false,
            filterDisabledWitness: false,
            showOnlyLatestVersion: false,
            filterByVotes: false,
            filterEnabledWithBlocksWitness: false,
        };
        this.accountWitnessVote = (accountName, approve, e) => {
            e.preventDefault();
            const { username, accountWitnessVote } = this.props;
            this.setState({ customUsername: '' });
            accountWitnessVote(username, accountName, approve);
        };
        this.onWitnessChange = (e) => {
            const customUsername = e.target.value;
            this.setState({ customUsername });
            // Force update to ensure witness vote appears
            this.forceUpdate();
        };
        this.accountWitnessProxy = (e) => {
            e.preventDefault();
            const { username, accountWitnessProxy } = this.props;
            accountWitnessProxy(username, this.state.proxy, (state) => {
                this.setState(state);
            });
        };
    }

    componentDidMount() {
        this.setState({
            witnessToHighlight: this.props.location.query.highlight,
        });
        this.loadWitnessAccounts();
    }

    componentDidUpdate() {
        this.scrollToHighlightedWitness();
    }

    shouldComponentUpdate(np, ns) {
        return (
            !is(np.witness_votes, this.props.witness_votes) ||
            !is(np.witnessVotesInProgress, this.props.witnessVotesInProgress) ||
            np.witnesses !== this.props.witnesses ||
            np.witness_list !== this.props.witness_list ||
            np.current_proxy !== this.props.current_proxy ||
            np.username !== this.props.username ||
            ns.customUsername !== this.state.customUsername ||
            ns.proxy !== this.state.proxy ||
            ns.proxyFailed !== this.state.proxyFailed ||
            ns.witnessAccounts !== this.state.witnessAccounts ||
            ns.witnessToHighlight !== this.state.witnessToHighlight ||
            ns.filterDisabledWitness !== this.state.filterDisabledWitness ||
            ns.filterEnabledWitness !== this.state.filterEnabledWitness ||
            ns.filterByVotes !== this.state.filterByVotes ||
            ns.showOnlyLatestVersion !== this.state.showOnlyLatestVersion ||
            ns.filterEnabledWithBlocksWitness !==
                this.state.filterEnabledWithBlocksWitness
        );
    }

    async loadWitnessAccounts() {
        const witnessAccounts = this.state.witnessAccounts;
        let witness_list = this.props.witness_list;
        const witnessOwners = [[]];
        let chunksCount = 0;

        witness_list = witness_list.sort((a, b) => {
            return Long.fromString(String(b.get('votes'))).subtract(
                Long.fromString(String(a.get('votes'))).toString()
            );
        });

        witness_list = this.filterWitnessesByFlags(witness_list);

        witness_list.map((item) => {
            if (witnessOwners[chunksCount].length >= 20) {
                chunksCount += 1;
                witnessOwners[chunksCount] = [];
            }
            witnessOwners[chunksCount].push(item.get('owner'));
            return true;
        });

        for (let oi = 0; oi < witnessOwners.length; oi += 1) {
            const owners = witnessOwners[oi];
            const res = await api.getAccountsAsync(owners);
            if (!(res && res.length > 0)) {
                console.error(tt('g.account_not_found'));
                return false;
            }

            for (let ri = 0; ri < res.length; ri += 1) {
                const witnessAccount = res[ri];
                const jsonMetadataString = _.get(
                    witnessAccount,
                    'json_metadata',
                    ''
                );
                const postingJsonMetadataString = _.get(
                    witnessAccount,
                    'posting_json_metadata',
                    jsonMetadataString
                );

                let jsonMetadata = { witness_description: '' };
                try {
                    jsonMetadata = JSON.parse(postingJsonMetadataString);
                } catch (err) {
                    // Use default value
                }

                witnessAccounts[witnessAccount.name] = jsonMetadata;
            }
        }

        this.setState({ witnessAccounts: { ...witnessAccounts } });
        return true;
    }

    scrollToHighlightedWitness() {
        if (typeof document !== 'undefined') {
            const highlightedWitnessElement = document.querySelector(
                '.Witnesses__highlight'
            );
            if (highlightedWitnessElement) {
                highlightedWitnessElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center',
                });
            }
        }
    }

    updateWitnessToHighlight(witness) {
        this.setState({ witnessToHighlight: witness });
        window.history.pushState('', '', `/~witnesses?highlight=${witness}`);
    }

    toggleEnabledWitness() {
        this.setState({
            filterEnabledWitness: !this.state.filterEnabledWitness,
            filterDisabledWitness: false,
            filterEnabledWithBlocksWitness: false,
        });
    }

    toggleEnabledWithBlocksWitness() {
        this.setState({
            filterEnabledWithBlocksWitness:
                !this.state.filterEnabledWithBlocksWitness,
            filterDisabledWitness: false,
            filterEnabledWitness: false,
        });
    }

    toggleDisabledWitness() {
        this.setState({
            filterDisabledWitness: !this.state.filterDisabledWitness,
            filterEnabledWitness: false,
            filterEnabledWithBlocksWitness: false,
        });
    }

    toggleLatestVersion() {
        this.setState({
            showOnlyLatestVersion: !this.state.showOnlyLatestVersion,
        });
    }

    toggleMyVotes() {
        this.setState({ filterByVotes: !this.state.filterByVotes });
    }

    filterWitnessesByFlags(sorted_witnesses, witness_votes) {
        const {
            filterDisabledWitness,
            filterEnabledWitness,
            showOnlyLatestVersion,
            filterByVotes,
            filterEnabledWithBlocksWitness,
        } = this.state;
        if (filterDisabledWitness) {
            sorted_witnesses = sorted_witnesses.filter((item) => {
                const signingKey = item.get('signing_key');
                const isDisabled = signingKey === DISABLED_SIGNING_KEY;
                return isDisabled;
            });
        }
        if (filterEnabledWitness) {
            sorted_witnesses = sorted_witnesses.filter((item) => {
                const signingKey = item.get('signing_key');
                const isDisabled = signingKey === DISABLED_SIGNING_KEY;
                return !isDisabled;
            });
        }
        if (showOnlyLatestVersion) {
            sorted_witnesses = sorted_witnesses.filter((item) => {
                const runningVersion = item.get('running_version');
                return runningVersion >= '0.7.0';
            });
        }

        if (filterByVotes) {
            sorted_witnesses = sorted_witnesses.filter((item) => {
                const myVote = witness_votes
                    ? witness_votes.has(item.get('owner'))
                    : null;
                return myVote === true;
            });
        }

        if (filterEnabledWithBlocksWitness) {
            sorted_witnesses = sorted_witnesses.filter((item) => {
                const signingKey = item.get('signing_key');
                const isDisabled = signingKey == DISABLED_SIGNING_KEY;
                return item.get('last_confirmed_block_num') > 0 && !isDisabled;
            });
        }
        return sorted_witnesses;
    }

    render() {
        const {
            props: {
                witness_votes,
                witnessVotesInProgress,
                current_proxy,
                head_block,
            },
            state: {
                customUsername,
                proxy,
                witnessAccounts,
                witnessToHighlight,
            },
            accountWitnessVote,
            accountWitnessProxy,
            onWitnessChange,
            updateWitnessToHighlight,
        } = this;

        let sorted_witnesses = this.props.witness_list.sort((a, b) => {
            return Long.fromString(String(b.get('votes'))).subtract(
                Long.fromString(String(a.get('votes'))).toString()
            );
        });

        const rankMap = new Map();
        sorted_witnesses.map((item, index) => {
            rankMap.set(item.get('owner'), index + 1);
        });
        this.rankMap = rankMap;

        sorted_witnesses = this.filterWitnessesByFlags(
            sorted_witnesses,
            witness_votes
        );

        let witness_vote_count = 30;
        let rank = 1;
        let foundWitnessToHighlight = false;
        let previousTotalVoteHpf = 0;
        const now = Moment();

        const witnesses = sorted_witnesses.map((item) => {
            const owner = item.get('owner');
            if (owner === witnessToHighlight) {
                foundWitnessToHighlight = true;
            }
            const witnessDescription = _.get(
                witnessAccounts[owner],
                'profile.witness_description',
                null
            );
            const totalVotesVests = item.get('votes');
            const totalVotesHpf = vestsToHpf(
                this.props.state,
                `${totalVotesVests / 1000000} VESTS`
            );
            const totalVotesHp = formatLargeNumber(totalVotesHpf, 2);

            let requiredHpToRankUp = '';
            if (previousTotalVoteHpf !== 0) {
                requiredHpToRankUp = (
                    <small>
                        {tt('witnesses_jsx.hp_required_to_rank_up', {
                            votehp: formatLargeNumber(
                                previousTotalVoteHpf - totalVotesHpf
                            ),
                        })}
                    </small>
                );
            }

            previousTotalVoteHpf = totalVotesHpf;

            const thread = item.get('url').replace('steemit.com', 'blurt.blog');
            const myVote = witness_votes ? witness_votes.has(owner) : null;
            const signingKey = item.get('signing_key');
            const witnessCreated = item.get('created');

            const accountBirthday = Moment(`${witnessCreated}Z`);
            const witnessAgeDays = now.diff(accountBirthday, 'days');
            const witnessAgeWeeks = now.diff(accountBirthday, 'weeks');
            const witnessAgeMonths = now.diff(accountBirthday, 'months');
            const witnessAgeYears = now.diff(accountBirthday, 'years');

            let witnessAge = `${witnessAgeDays} ${tt('g.days')}`;
            if (witnessCreated === '1970-01-01T00:00:00') {
                witnessAge = 'over 3 years';
            } else if (witnessAgeYears > 0) {
                witnessAge = `${witnessAgeYears} ${tt('g.years')}`;
            } else if (witnessAgeMonths > 0) {
                witnessAge = `${witnessAgeMonths} ${tt('g.months')}`;
            } else if (witnessAgeWeeks > 0) {
                witnessAge = `${witnessAgeWeeks} ${tt('g.weeks')}`;
            }

            const lastBlock = item.get('last_confirmed_block_num');
            const runningVersion = item.get('running_version');
            const noBlock7days = (head_block - lastBlock) * 3 > 604800;
            const isDisabled = signingKey == DISABLED_SIGNING_KEY;
            const accountCreationFee = item.getIn([
                'props',
                'account_creation_fee',
            ]);
            const operationFlatFee = item.getIn([
                'props',
                'operation_flat_fee',
            ]);
            const bandwidthFee = item.getIn(['props', 'bandwidth_kbytes_fee']);
            const missedBlocks = item.get('total_missed');
            const votingActive = witnessVotesInProgress.has(owner);
            const classUp =
                'Voting__button Voting__button-up' +
                (myVote === true ? ' Voting__button--upvoted' : '') +
                (votingActive ? ' votingUp' : '');
            const up = (
                <Icon
                    name={votingActive ? 'empty' : 'chevron-up-circle'}
                    className="upvote"
                />
            );

            let witness_link = '';
            if (thread) {
                if (!/^https?:\/\//.test(thread)) {
                    witness_link = '(No URL provided)';
                } else if (links.remote.test(thread)) {
                    witness_link = (
                        <a href={thread} target="_blank" rel="noreferrer">
                            {tt('witnesses_jsx.external_site')}&nbsp;
                            <Icon name="extlink" />
                        </a>
                    );
                } else {
                    witness_link = (
                        <a href={thread} target="_blank" rel="noreferrer">
                            {tt('witnesses_jsx.witness_thread')}&nbsp;
                            <Icon name="extlink" />
                        </a>
                    );
                }
            }

            const ownerStyle = isDisabled
                ? { textDecoration: 'line-through', color: '#AAA' }
                : {};

            return (
                <tr
                    key={owner}
                    className={classnames({
                        Witnesses__highlight: witnessToHighlight === owner,
                    })}
                >
                    <td>
                        {rank < 10 && '0'}
                        {rank++}
                    </td>
                    <td className="Witnesses__rank">
                        {this.rankMap.get(owner) < 10 && '0'}
                        {this.rankMap.get(owner)}
                        &nbsp;&nbsp;
                        <span className={classUp}>
                            {votingActive ? (
                                up
                            ) : (
                                <a
                                    href="#"
                                    onClick={accountWitnessVote.bind(
                                        this,
                                        owner,
                                        !myVote
                                    )}
                                    title={
                                        myVote === true
                                            ? tt('g.remove_vote')
                                            : tt('g.vote')
                                    }
                                >
                                    {up}
                                </a>
                            )}
                        </span>
                    </td>
                    <td className="Witnesses__info">
                        <Link to={'/@' + owner} style={ownerStyle}>
                            <Userpic
                                account={owner}
                                size="small"
                                className={classnames({
                                    disabled: isDisabled,
                                })}
                            />
                        </Link>
                        <div className="Witnesses__info">
                            <div>
                                <Link to={'/@' + owner} style={ownerStyle}>
                                    {owner}
                                </Link>
                                <Link
                                    to={`/~witnesses?highlight=${owner}`}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        updateWitnessToHighlight.apply(this, [
                                            owner,
                                        ]);
                                    }}
                                >
                                    <Icon
                                        name="chain"
                                        size="0.7x"
                                        className="Witnesses__permlink"
                                    />
                                </Link>
                            </div>
                            <div>
                                <small>
                                    {noBlock7days && (
                                        <div>
                                            <strong>
                                                <span
                                                    role="img"
                                                    aria-label={tt(
                                                        'witnesses_jsx.not_produced_over_a_week'
                                                    )}
                                                >
                                                    ⚠️
                                                </span>
                                                {tt(
                                                    'witnesses_jsx.not_produced_over_a_week'
                                                )}
                                            </strong>
                                        </div>
                                    )}
                                    <div>
                                        {witnessDescription && (
                                            <div className="Witnesses__description">
                                                {witnessDescription}
                                            </div>
                                        )}
                                        {tt('witnesses_jsx.last_block')}{' '}
                                        <Link
                                            to={`https://blocks.blurtwallet.com/#/b/${lastBlock}`}
                                            target="_blank"
                                        >
                                            #{lastBlock}
                                        </Link>{' '}
                                        {_blockGap(head_block, lastBlock)} on v
                                        {runningVersion}
                                    </div>
                                    {isDisabled && (
                                        <div>
                                            {`${tt(
                                                'witnesses_jsx.disabled'
                                            )} ${_blockGap(
                                                head_block,
                                                lastBlock
                                            )}`}
                                        </div>
                                    )}
                                    {!isDisabled && (
                                        <div>
                                            {`${tt(
                                                'witnesses_jsx.witness_age'
                                            )}: ${witnessAge}`}
                                        </div>
                                    )}
                                </small>
                            </div>
                            {!isDisabled && (
                                <div className="witness__thread">
                                    <small>{witness_link}</small>
                                </div>
                            )}
                        </div>
                    </td>
                    <td>
                        <small>
                            <div>
                                {`Account Creation Fee: ${accountCreationFee}`}
                            </div>
                            <div>
                                {`Operation Flat Fee: ${operationFlatFee}`}
                            </div>
                            <div>{`Bandwidth Fee: ${bandwidthFee} per kB`}</div>
                        </small>
                    </td>
                    <td>{missedBlocks.toString()}</td>
                    <td>
                        {`${totalVotesHp} BP`}
                        {!isDisabled && <div>{requiredHpToRankUp}</div>}
                    </td>
                </tr>
            );
        });

        let addl_witnesses = false;
        const sortedWitnessNames = sorted_witnesses.map((witness) => {
            return witness.get('owner');
        });
        if (witness_votes) {
            witness_vote_count -= witness_votes.size;
            addl_witnesses = witness_votes
                .union(witnessVotesInProgress)
                .filter((item) => {
                    return sortedWitnessNames.indexOf(item) === -1;
                })
                .map((item) => {
                    const votingActive = witnessVotesInProgress.has(item);
                    const classUp =
                        'Voting__button Voting__button-up' +
                        (votingActive
                            ? ' votingUp'
                            : ' Voting__button--upvoted');
                    const up = (
                        <Icon
                            name={votingActive ? 'empty' : 'chevron-up-circle'}
                            className="upvote"
                        />
                    );
                    return (
                        <div className="row" key={item}>
                            <div className="column small-12">
                                <span>
                                    {/* className="Voting" */}
                                    <span className={classUp}>
                                        {votingActive ? (
                                            up
                                        ) : (
                                            <a
                                                href="#"
                                                onClick={accountWitnessVote.bind(
                                                    this,
                                                    item,
                                                    false
                                                )}
                                                title={tt('g.remove_vote')}
                                            >
                                                {up}
                                            </a>
                                        )}
                                        &nbsp;
                                    </span>
                                </span>
                                <Link to={'/@' + item}>{item}</Link>
                            </div>
                        </div>
                    );
                })
                .toArray();
        }

        return (
            <div className="Witnesses">
                <div className="row">
                    <div className="column">
                        <h2>{tt('witnesses_jsx.top_witnesses')}</h2>
                        {current_proxy && current_proxy.length ? null : (
                            <div>
                                <p>
                                    <strong>
                                        {tt(
                                            'witnesses_jsx.you_have_votes_remaining',
                                            { count: witness_vote_count }
                                        )}
                                        .
                                    </strong>{' '}
                                    {tt(
                                        'witnesses_jsx.you_can_vote_for_maximum_of_witnesses'
                                    )}
                                    .
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                {current_proxy ? null : (
                    <div className="row small-collapse">
                        <div className="small-12 medium-9 large-10 columns">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Serial No</th>
                                        <th>{tt('witnesses_jsx.rank')}</th>
                                        <th>{tt('witnesses_jsx.witness')}</th>
                                        <th>{tt('witnesses_jsx.fees')}</th>
                                        <th>
                                            {tt('witnesses_jsx.missed_blocks')}
                                        </th>
                                        <th className="Witnesses__votes">
                                            {tt('witnesses_jsx.votes_received')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>{witnesses.toArray()}</tbody>
                            </table>
                        </div>
                        <div className="columns small-12 medium-3 large-2 hide-for-small-only">
                            <div
                                style={{ marginLeft: '20px' }}
                                className="panel callout radius"
                            >
                                <h3>Filters</h3>
                                <hr />
                                <input
                                    checked={
                                        this.state
                                            .filterEnabledWithBlocksWitness
                                    }
                                    onChange={() =>
                                        this.toggleEnabledWithBlocksWitness()
                                    }
                                    id="enabled_blocks"
                                    type="checkbox"
                                />
                                <label htmlFor="enabled_blocks">
                                    Active (Blocks)
                                </label>
                                <br />
                                <input
                                    checked={this.state.filterEnabledWitness}
                                    onChange={() => this.toggleEnabledWitness()}
                                    id="enabled"
                                    type="checkbox"
                                />
                                <label htmlFor="enabled">Active</label>
                                <br />
                                <input
                                    checked={this.state.filterDisabledWitness}
                                    onChange={() =>
                                        this.toggleDisabledWitness()
                                    }
                                    id="disabled"
                                    type="checkbox"
                                />
                                <label htmlFor="disabled">Disabled</label>
                                <br />
                                <input
                                    checked={this.state.showOnlyLatestVersion}
                                    onChange={() => this.toggleLatestVersion()}
                                    id="version"
                                    type="checkbox"
                                />
                                <label htmlFor="version">Latest Version</label>
                                <br />
                                <input
                                    checked={this.state.filterByVotes}
                                    onChange={() => this.toggleMyVotes()}
                                    id="myVotes"
                                    type="checkbox"
                                />
                                <label htmlFor="myVotes">My Votes</label>
                            </div>
                        </div>
                    </div>
                )}

                {/* {current_proxy ? null : (
                    <div
                        className={classnames('row', {
                            Witnesses__highlight:
                                witnessToHighlight &&
                                foundWitnessToHighlight === false,
                        })}
                    >
                        <div className="column">
                            <p>
                                {tt(
                                    'witnesses_jsx.if_you_want_to_vote_outside_of_top_enter_account_name'
                                )}
                                .
                            </p>
                            <form>
                                <div className="input-group">
                                    <span className="input-group-label">@</span>
                                    <input
                                        className="input-group-field"
                                        type="text"
                                        style={{
                                            float: 'left',
                                            width: '75%',
                                            maxWidth: '20rem',
                                        }}
                                        value={
                                            foundWitnessToHighlight === true
                                                ? customUsername
                                                : witnessToHighlight
                                        }
                                        onChange={onWitnessChange}
                                    />
                                    <div className="input-group-button">
                                        <button
                                            className="button"
                                            onClick={accountWitnessVote.bind(
                                                this,
                                                customUsername,
                                                !(witness_votes
                                                    ? witness_votes.has(
                                                        customUsername
                                                    )
                                                    : null)
                                            )}
                                        >
                                            {tt('g.vote')}
                                        </button>
                                    </div>
                                </div>
                            </form>
                            <br />
                            {addl_witnesses}
                            <br />
                            <br />
                        </div>
                    </div>
                )} */}

                <div className="row">
                    <div className="column">
                        <p>
                            {current_proxy
                                ? tt('witnesses_jsx.witness_set')
                                : tt('witnesses_jsx.set_witness_proxy')}
                        </p>
                        {current_proxy ? (
                            <div>
                                <div style={{ paddingBottom: 10 }}>
                                    {tt('witnesses_jsx.witness_proxy_current')}:{' '}
                                    <strong>{current_proxy}</strong>
                                </div>

                                <form>
                                    <div className="input-group">
                                        <input
                                            className="input-group-field bold"
                                            disabled
                                            type="text"
                                            style={{
                                                float: 'left',
                                                width: '75%',
                                                maxWidth: '20rem',
                                            }}
                                            value={current_proxy}
                                        />
                                        <div className="input-group-button">
                                            <button
                                                style={{ marginBottom: 0 }}
                                                className="button"
                                                onClick={accountWitnessProxy}
                                            >
                                                {tt(
                                                    'witnesses_jsx.witness_proxy_clear'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            <form>
                                <div className="input-group">
                                    <span className="input-group-label">@</span>
                                    <input
                                        className="input-group-field bold"
                                        type="text"
                                        style={{
                                            float: 'left',
                                            width: '75%',
                                            maxWidth: '20rem',
                                        }}
                                        value={proxy}
                                        onChange={(e) => {
                                            this.setState({
                                                proxy: e.target.value,
                                            });
                                        }}
                                    />
                                    <div className="input-group-button">
                                        <button
                                            style={{ marginBottom: 0 }}
                                            className="button"
                                            onClick={accountWitnessProxy}
                                        >
                                            {tt(
                                                'witnesses_jsx.witness_proxy_set'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                        {this.state.proxyFailed && (
                            <p className="error">
                                {tt('witnesses_jsx.proxy_update_error')}.
                            </p>
                        )}
                        <br />
                    </div>
                </div>
            </div>
        );
    }
}

module.exports = {
    path: '/~witnesses(/:witness)',
    component: connect(
        (state) => {
            const current_user = state.user.get('current');
            const username = current_user && current_user.get('username');
            const current_account =
                current_user && state.global.getIn(['accounts', username]);
            const witness_votes =
                current_account && current_account.get('witness_votes').toSet();
            const current_proxy =
                current_account && current_account.get('proxy');
            const witnesses = state.global.get('witnesses', List());
            const witness_list = state.global.get('witness_list', List());
            const witnessVotesInProgress = state.global.get(
                `transaction_witness_vote_active_${username}`,
                Set()
            );
            return {
                head_block: state.global.getIn(['props', 'head_block_number']),
                witnesses,
                username,
                witness_votes,
                witnessVotesInProgress,
                current_proxy,
                state,
                witness_list,
            };
        },
        (dispatch) => {
            return {
                accountWitnessVote: (username, witness, approve) => {
                    dispatch(
                        transactionActions.broadcastOperation({
                            type: 'account_witness_vote',
                            operation: { account: username, witness, approve },
                            confirm: !approve
                                ? 'You are about to remove your vote for this witness'
                                : null,
                        })
                    );
                },
                accountWitnessProxy: (account, proxy, stateCallback) => {
                    dispatch(
                        transactionActions.broadcastOperation({
                            type: 'account_witness_proxy',
                            operation: { account, proxy },
                            confirm: proxy.length
                                ? 'Set proxy to: ' + proxy
                                : 'You are about to remove your proxy.',
                            successCallback: () => {
                                dispatch(
                                    globalActions.updateAccountWitnessProxy({
                                        account,
                                        proxy,
                                    })
                                );
                                stateCallback({
                                    proxyFailed: false,
                                    proxy: '',
                                });
                            },
                            errorCallback: (e) => {
                                console.log('error:', e);
                                stateCallback({ proxyFailed: true });
                            },
                        })
                    );
                },
            };
        }
    )(Witnesses),
};
