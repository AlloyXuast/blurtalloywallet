import tt from 'counterpart';
import BadActorList from 'app/utils/BadActorList';
import VerifiedExchangeList from 'app/utils/VerifiedExchangeList';
import SuspendedExchangeList from 'app/utils/SuspendedExchangeList';
import DelegationBlockedList from 'app/utils/DelegationBlockedList';
import { PrivateKey, PublicKey } from '@blurtfoundation/blurtjs/lib/auth/ecc';

export function validate_account_name(value) {
    let i, label, len, length, ref;

    if (!value) {
        return tt('chainvalidation_js.account_name_should_not_be_empty');
    }
    length = value.length;
    if (length < 3) {
        return tt('chainvalidation_js.account_name_should_be_longer');
    }
    if (length > 16) {
        return tt('chainvalidation_js.account_name_should_be_shorter');
    }
    if (BadActorList.includes(value)) {
        return tt('chainvalidation_js.badactor');
    }
    ref = value.split('.');
    for (i = 0, len = ref.length; i < len; i++) {
        label = ref[i];
        if (!/^[a-z]/.test(label)) {
            return tt(
                'chainvalidation_js.each_account_segment_should_start_with_a_letter'
            );
        }
        if (!/^[a-z0-9-]*$/.test(label)) {
            return tt(
                'chainvalidation_js.each_account_segment_should_have_only_letters_digits_or_dashes'
            );
        }
        if (/--/.test(label)) {
            return tt(
                'chainvalidation_js.each_account_segment_should_have_only_one_dash_in_a_row'
            );
        }
        if (!/[a-z0-9]$/.test(label)) {
            return tt(
                'chainvalidation_js.each_account_segment_should_end_with_a_letter_or_digit'
            );
        }
        if (!(label.length >= 3)) {
            return tt(
                'chainvalidation_js.each_account_segment_should_be_longer'
            );
        }
    }
    return null;
}

/**
 * Do some additional validation for situations where an account name is used along with a memo.
 * Currently only used in the Transfers compoonent.
 *
 * @param {string} name
 * @param {string} memo
 * @param {string} transferType
 * @param {string} amount
 * @returns {null|string} string if there's a validation error
 */
export function validate_account_name_with_memo(
    name,
    memo,
    transferType,
    amount
) {
    if (VerifiedExchangeList.includes(name) && !memo) {
        return tt('chainvalidation_js.verified_exchange_no_memo');
    }
    if (SuspendedExchangeList.includes(name)) {
        return tt('chainvalidation_js.suspended_exchange');
    }
    if (name == 'blurt-swap' && memo && !memo.startsWith('SWAP.BLURT')) {
        return tt('chainvalidation_js.invalid_memo');
    }
    if (
        transferType === 'Delegate to Account' &&
        parseFloat(amount) > 0 &&
        DelegationBlockedList.includes(name)
    ) {
        return tt('chainvalidation_js.delegation_blocked');
    }
    return validate_account_name(name);
}

export function validate_memo_field(value, username, memokey) {
    value = value.split(' ').filter((v) => v != '');
    for (const w in value) {
        // Only perform key tests if it might be a key, i.e. it is a long string.
        if (value[w].length >= 39) {
            if (/5[HJK]\w{40,45}/i.test(value[w])) {
                return tt('chainvalidation_js.memo_has_privatekey');
            }
            if (PrivateKey.isWif(value[w])) {
                return tt('chainvalidation_js.memo_is_privatekey');
            }
            if (
                memokey ===
                PrivateKey.fromSeed(username + 'memo' + value[w])
                    .toPublicKey()
                    .toString()
            ) {
                return tt('chainvalidation_js.memo_is_password');
            }
        }
    }
    return null;
}
