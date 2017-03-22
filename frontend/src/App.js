import jsonschema from 'jsonschema';
import _ from 'lodash';
import queryString from 'query-string';
import React from 'react';
import {
  Checkbox,
  Col,
  Grid,
  Row,
  Table
} from 'react-bootstrap';
import cookie from 'react-cookie';

import './App.css';
import userDataSchema from './userDataSchema.js';

function getSLSBaseURL () {
  if (process.env.REACT_APP_LOCAL_SLS) {
    return "https://localhost:4000";
  } else {
    return "https://jc6e81at9k.execute-api.us-west-2.amazonaws.com/dev";
  }
}

class App extends React.Component {
  componentWillMount() {
    let foundUsername = null;
    let foundToken = null;

    const qvars = queryString.parse(location.search);
    const cookieUsername = cookie.load('username');
    const cookieToken = cookie.load('token');
    if (qvars.access_token && qvars.username) {
      foundUsername = qvars.username;
      foundToken = qvars.access_token;
      cookie.save('username', foundUsername, {
        secure: true
      });
      cookie.save('token', foundToken, {
        secure: true
      });
    } else if (cookieUsername !== undefined && cookieToken !== undefined) {
      foundUsername = cookieUsername;
      foundToken = cookieToken;
    }
    this.state = {
      username: foundUsername,
      token: foundToken
    };
  }
  render() {
    let header = {};
    let body = {};
    if (!this.state.username) {
      const authParams = {
        client_id: "dqlmuqav6goh1cy9bdmpyu6wz",
        redirect_uri: "https://localhost:3000/",
        response_type: "token"
      };
      const authUrl = "https://www.beeminder.com/apps/authorize?" + queryString.stringify(authParams);
      header = <a href={authUrl}>Authorize</a>;
      body = "";
    } else {
      header = "Sup, " + this.state.username + "?";
      body = <GoalsTable username={this.state.username} token={this.state.token} />
    }
    return (
      <Grid>
          <Row>
              <Col md={12}>{header}</Col>
          </Row>
          <Row>
              <Col md={12}>{body}</Col>
          </Row>
      </Grid>
    )
  }
}

class GoalsTable extends React.Component {
  constructor (props) {
    super(props);
    this.state = ({
      goals: {}
    });

    this.setupTable();
  }

  async setupTable() {
    await this.getGoalSlugs();
    await this.getStoredGoals();
  }

  async getGoalSlugs() {
    const queryParams = {"access_token": this.props.token}
    let resp = await
      fetch(getSLSBaseURL() + "/getGoalSlugs?" +
            queryString.stringify(queryParams));
    const respArray = await resp.json();
    for (let slug of respArray) {
      this.setState(prevState => _.merge({}, prevState, {goals: {[slug]: "fetching"}}));
    }
  }

  async getStoredGoals() {
    const qstring = queryString.stringify(
      {username: this.props.username, token: this.props.token});
    let resp = await fetch(getSLSBaseURL() + "/getStoredGoals?" + qstring);
    // There should be error handling here.
    const respObj = await resp.json();
    const validationResult = jsonschema.validate(respObj, userDataSchema);
    if (!validationResult.valid) {
      alert("Server sent invalid data. This should never happen. Try refreshing?");
    } else {
      _.forEach(respObj.goals, (schedule, goalSlug) => {
        if (this.state.goals[goalSlug] === undefined) {
          // Cleaning up goals that exist in DynamoDB but not on Beeminder is
          // the backend's responsibility.
          return;
        } else {
          this.setState(prevState => _.merge({}, prevState, {goals: {[goalSlug]: schedule}}));
        }
      });
      _.forEach(this.state.goals, (schedule, goalSlug) => {
        if (schedule === "fetching") {
          this.setState(prevState => _.merge({}, prevState, {goals: {[goalSlug]: "unscheduled"}}));
        }
      });
    }
  }

  render() {
    const sortedGoals = _.sortBy(_.toPairs(this.state.goals), g => g[0]);
    const scheduledGoals = _.filter(sortedGoals, g => Array.isArray(g[1]));
    const unscheduledGoals = _.filter(sortedGoals, g => !Array.isArray(g[1]));
    const rowify = (x => <GoalRow key={x[0]} slug={x[0]} schedule={x[1]}/>);

    return (
      <Table>
        <thead>
          <tr>
              {["Goal name",
                "Using Beescheduler",
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"].map((str, idx) => <th key={idx} scope='col'>{str}</th>)}
          </tr>
        </thead>
        <tbody>
            {scheduledGoals.map(rowify)}
            {unscheduledGoals.map(rowify)}
        </tbody>
      </Table>
    );
  }
}

class GoalRow extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    let days;

    if (this.props.schedule === "fetching") {
      days = Array(7).fill("?");
    } else if (this.props.schedule === "unscheduled") {
      days = Array(7).fill("N/A");
    } else {
      days = this.props.schedule.map(x => x.toString());
    }
    let daysEls = days.map((str, idx) => <td key={idx}>{str}</td>);
    return (
      <tr>
        <th scope='row'>
            {this.props.slug}
        </th>
        <td>
            <Checkbox checked={Array.isArray(this.props.schedule)}/>
        </td>
        {daysEls}
    </tr>
    );
  }
}

export default App;
