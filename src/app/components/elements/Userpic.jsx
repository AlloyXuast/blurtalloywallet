import React, { Component } from 'react';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import shouldComponentUpdate from 'app/utils/shouldComponentUpdate';
import { imageProxy } from 'app/utils/ProxifyUrl';

export const SIZE_SMALL = '64x64';
export const SIZE_MED = '128x128';
export const SIZE_LARGE = '512x512';

const sizeList = [SIZE_SMALL, SIZE_MED, SIZE_LARGE];

export const avatarSize = {
    small: SIZE_SMALL,
    medium: SIZE_MED,
    large: SIZE_LARGE,
};

class Userpic extends Component {
    shouldComponentUpdate = shouldComponentUpdate(this, 'Userpic');

    render() {
        const { account, size, className = '' } = this.props;
        const hideIfDefault = this.props.hideIfDefault || false;
        let avSize = size && sizeList.indexOf(size) > -1 ? '/' + size : '';
        if (avSize === '') {
            avSize = '/64x64';
        }
        let imageUrl = '';
        // Get profile picture from image proxy

        imageUrl = `${imageProxy()}profileimage/${account}${avSize}`;

        const style = { backgroundImage: `url(${imageUrl})` };

        return (
            <div className={classnames('Userpic', className)} style={style} />
        );
    }
}

Userpic.propTypes = {
    account: PropTypes.string.isRequired,
};

export default connect((state, ownProps) => {
    const { account, hideIfDefault } = ownProps;
    return {
        account,
        json_metadata: state.global.getIn([
            'accounts',
            account,
            'json_metadata',
        ]),
        hideIfDefault,
    };
})(Userpic);
