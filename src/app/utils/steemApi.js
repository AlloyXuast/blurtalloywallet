import { api } from '@blurtfoundation/blurtjs';
import axios from 'axios';
import stateCleaner from 'app/redux/stateCleaner';

export async function getStateAsync(url) {
    // strip off query string
    const path = url.split('?')[0];

    const raw = await api.getStateAsync(path);

    const witness_list = await api.getWitnessesByVoteAsync('', 250);

    raw.witness_list = witness_list;

    await axios
        .get($STM_Config.price_info_url, { timeout: 3000 })
        .then((response) => {
            if (response.status === 200) {
                raw.blurt_price = Number(response.data.price_usd).toFixed(8);
            }
        })
        .catch((error) => {
            console.error(error);
        });
    const chainProperties = await getChainProperties();
    if (chainProperties) {
        raw.props.operation_flat_fee = chainProperties.operation_flat_fee;
        raw.props.bandwidth_kbytes_fee = chainProperties.bandwidth_kbytes_fee;
    }

    const cleansed = stateCleaner(raw);

    return cleansed;
}

function getChainProperties() {
    return new Promise((resolve, reject) => {
        api.getChainProperties((err, result) => {
            if (result) {
                resolve(result);
            } else {
                resolve({});
            }
        });
    });
}
