import React from 'react';
import './App.css';
import cookie from 'react-cookie';
import queryString from 'query-string';
import {
  Col,
  Grid,
  Row,
  Table
} from 'react-bootstrap';

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
      let authParams = {
        client_id: "dqlmuqav6goh1cy9bdmpyu6wz",
        redirect_uri: "http://localhost:3000/",
        response_type: "token"
      };
      let authUrl = "https://www.beeminder.com/apps/authorize?" + queryString.stringify(authParams);
      header = <a href={authUrl}>Authorize</a>;
    } else {
      header = "Sup, " + this.state.username + " ?";
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
  componentWillMount() {
    // Make XHR to Lambda here to get a list of all the user's goals and their
    // schedules.
    this.setState({
      goals: [{
        name: 'poop',
      }, {
        name: 'lift',
        schedule: [0, 0, 0, 20, 20, 20, 0]
      }]
    });
  }
  render() {
    return (
      <Table>
        <thead>
          <tr>
      {["Goal name",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"].map(x => <th scope='col'>{x}</th>)}
          </tr>
        </thead>
        <tbody>
          {this.state.goals.map(x => <GoalRow key={x.name} goal={x} />)}
        </tbody>
      </Table>
    );
  }
}

function GoalRow(props) {
  let days;
  if (props.goal.schedule === undefined) {
    days = Array(7).fill("?");
  } else {
    days = props.goal.schedule.map(x => x.toString());
  }
  let daysEls = days.map((str, idx) => <td key={idx}>{str}</td>);
  return (
    <tr>
      <th scope='row'>{props.goal.name}</th>
      {daysEls}
    </tr>
  );
}

export default App;
