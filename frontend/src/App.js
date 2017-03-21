import React from 'react';
import './App.css';
import cookie from 'react-cookie';
import queryString from 'query-string';
import {
  Checkbox,
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
        redirect_uri: "https://localhost:3000/",
        response_type: "token"
      };
      let authUrl = "https://www.beeminder.com/apps/authorize?" + queryString.stringify(authParams);
      header = <a href={authUrl}>Authorize</a>;
      body = "";
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
  constructor (props) {
    super(props);
    // Make XHR to Lambda here to get a list of all the user's goals and their
    // schedules.
    this.state = ({
      goalslugs: []
    });

    this.getGoalSlugs();
  }

  async getGoalSlugs() {
    let queryParams = {"access_token": this.props.token}
    let resp = await
      fetch("https://jc6e81at9k.execute-api.us-west-2.amazonaws.com/dev/getGoalSlugs?" +
            queryString.stringify(queryParams));
    let respArray = await resp.json();
    this.setState({goalslugs: respArray});
  }

  render() {
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
            {this.state.goalslugs.map(x => <GoalRow key={x} slug={x} />)}
        </tbody>
      </Table>
    );
  }
}

class GoalRow extends React.Component {
  constructor(props) {
    super(props);
    this.state = {scheduled: "fetching"};
  }
  render() {
    let days;

    switch (this.state.scheduled) {
      case "yes":
        days = this.state.schedule.map(x => x.toString());
        break;
      case "fetching":
        days = Array(7).fill("?");
        break;
      case "no":
        days = Array(7).fill("N/A");
        break;
      default:
        throw this.state.scheduled;
    }
    let daysEls = days.map((str, idx) => <td key={idx}>{str}</td>);
    return (
      <tr>
        <th scope='row'>
            {this.props.slug}
        </th>
        <td>
            <Checkbox checked={this.state.scheduled === "yes"}/>
        </td>
        {daysEls}
    </tr>
    );
  }
}

export default App;
