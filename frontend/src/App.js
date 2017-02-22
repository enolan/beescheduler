import React from 'react';
import './App.css';
import cookie from 'react-cookie';
import queryString from 'query-string';

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
    if (!this.state.username) {
      let authParams = {
        client_id: "dqlmuqav6goh1cy9bdmpyu6wz",
        redirect_uri: "http://localhost:3000/",
        response_type: "token"
      };
      let authUrl = "https://www.beeminder.com/apps/authorize?" + queryString.stringify(authParams);
      return (<a href={authUrl}>Authorize</a>);
    }
    return (
      <div>
        <h1>Sup, {this.state.username}?</h1>
        <GoalsTable username={this.state.username} token={this.state.token} />
      </div>);
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
      <table>
        <thead>
          <tr>
            <td>Name</td>
            <td>Sunday</td>
            <td>Monday</td>
            <td>Tuesday</td>
            <td>Wednesday</td>
            <td>Thursday</td>
            <td>Friday</td>
            <td>Saturday</td>
          </tr>
          {this.state.goals.map(x => <GoalRow key={x.name} goal={x} />)}
        </thead>
      </table>
    );
  }
}

function GoalRow(props) {
  let days;
  if (props.goal.schedule === undefined) {
    days = Array(7);
  } else {
    days = props.goal.schedule.map(x => x.toString());
  }
  let daysEls = days.map((str, idx) => <td key={idx}>{str}</td>);
  return (
    <tr>
      <td>{props.goal.name}</td>
      {daysEls}
    </tr>
  );
}

export default App;
