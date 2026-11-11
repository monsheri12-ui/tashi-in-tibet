"""Use one connected letter-plus-O recording for each of the five prefixes."""
import copy

AO_SYMBOL = '@achung-prefix'
PREFIX_GLIDES = {
    'ག': {'symbol': '@ga-prefix', 'filename': 'gao-prefix', 'label': 'gao'},
    'ད': {'symbol': '@da-prefix', 'filename': 'dao-prefix', 'label': 'dao'},
    'བ': {'symbol': '@ba-prefix', 'filename': 'bao-prefix', 'label': 'bao'},
    'མ': {'symbol': '@ma-prefix', 'filename': 'mao-prefix', 'label': 'mao'},
    'འ': {'symbol': AO_SYMBOL, 'filename': 'ao-prefix', 'label': 'ao'},
}


def with_prefix_glides(plans, voice):
    result = copy.deepcopy(plans)
    if voice not in ('male', 'female'):
        return result
    for plan in result.values():
        prefix = plan['parts'].get('prefix')
        if prefix not in PREFIX_GLIDES:
            continue
        unit = PREFIX_GLIDES[prefix]
        steps = plan['steps']
        if steps[0].get('text') == unit['symbol']:
            continue
        assert [(s['kind'], s['text']) for s in steps[:2]] == [
            ('symbol', prefix), ('symbol', '@prefix')]
        assert steps[0]['focus'] == steps[1]['focus']
        plan['steps'] = [{'kind': 'symbol', 'text': unit['symbol'],
                          'label': unit['label'], 'stage': 'prefix-glide',
                          'focus': steps[0]['focus']}] + steps[2:]
    return result


# Existing scripts use this name. Keep their plans consistent with the bank.
with_ao_glide = with_prefix_glides
