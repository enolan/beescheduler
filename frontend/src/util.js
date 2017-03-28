import _ from 'lodash';

export function deepSetState(component, toMerge) {
  component.setState(prevState => _.merge({}, prevState, toMerge));
}
