"""Use the reviewed continuous AO recording for male achung prefixes."""
import copy

AO_SYMBOL = '@achung-prefix'


def with_ao_glide(plans, voice):
    result = copy.deepcopy(plans)
    if voice != 'male':
        return result
    for plan in result.values():
        if plan['parts'].get('prefix') != 'འ':
            continue
        steps = plan['steps']
        if steps[0].get('text') == AO_SYMBOL:
            continue
        assert [(s['kind'], s['text']) for s in steps[:2]] == [
            ('symbol', 'འ'), ('symbol', '@prefix')]
        assert steps[0]['focus'] == steps[1]['focus']
        plan['steps'] = [{'kind': 'symbol', 'text': AO_SYMBOL,
                          'label': 'ao', 'stage': 'prefix-glide',
                          'focus': steps[0]['focus']}] + steps[2:]
    return result
