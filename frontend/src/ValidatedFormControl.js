import _ from 'lodash';
import React from 'react';
import { FormControl } from 'react-bootstrap';

class ValidatedFormControl extends React.Component {
  constructor (props) {
    super(props);
    this.state = {currentVal: props.initVal, isValid: true};
  }
  render() {
    return (<FormControl
      size={this.props.size}
      style={_.merge({}, this.props.style, !this.state.isValid ? {color: "red", borderColor: "red"} : {})}
      value={this.state.currentVal}
      onChange={this.onChange}
      disabled={this.props.disabled}/>);
  }
  onChange = evt => {
    this.setState({currentVal: evt.target.value});
    const newIsValid = this.props.validate(evt.target.value);
    if (newIsValid !== this.state.isValid) {
      this.setState({isValid: newIsValid});
      (this.props.onValidationStateChange || _.noop)(newIsValid);
    }
    if(this.props.validate(evt.target.value)) {
      this.props.onChange(evt);
    }
  }
}

export default ValidatedFormControl;
