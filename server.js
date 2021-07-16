require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { ApolloServer, UserInputError } = require('apollo-server-express');
const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');
const { MongoClient } = require('mongodb');
const url = process.env.DB_URL || 'mongodb://localhost/issuetracker';

let aboutMessage = "Issue Tracker API v1.0";
let db;

const GraphQLDate = new GraphQLScalarType({
  name: 'GraphQLDate',
  description: 'A Date() type in GraphQL as a scalar',
  serialize(value) {
    return value.toISOString();
  },
  
  parseValue(value) {
    const dateValue = new Date(value);

    return isNaN(dateValue) ? undefined : dateValue; //whether a value is an illegal number (Not-a-Number).
  },
  parseLiteral(ast) {
    if (ast.kind == Kind.STRING) {
      const value = new Date(ast.value);
      return isNaN(value) ? undefined : value;
    }
  },
});

const resolvers = {
  Query: {
    about: () => aboutMessage,
    issueList,
    issue,
  },
  Mutation: {
    setAboutMessage,
    issueAdd,
  },
  GraphQLDate,  //It is also a resolver
};

function setAboutMessage(_, { message }) {
  return aboutMessage = message;
}

async function issue(_, { id }) {
  const issue = await db.collection('issues').findOne({ id });
  return issue;
}

async function issueList(_, { status }) {
  const filter = {};
  if (status) filter.status = status;
  const issues = await db.collection('issues').find(filter).toArray();
  //const issues = await db.collection('issues').find({}).toArray();
  return issues;
}

function issueValidate(issue) {
  const errors = [];
  if (issue.title.length < 3) {
    errors.push('Field "title" must be at least 3 characters long.');
  }
  if (issue.status === 'Assigned' && !issue.owner) {
    errors.push('Field "owner" is required when status is "Assigned"');
  }
  if (errors.length > 0) {
    throw new UserInputError('Invalid input(s)', { errors });
  }
}

async function issueAdd(_, { issue }) {
  issueValidate(issue);
  issue.created = new Date();
  issue.id = await getNextSequence('issues');
  const result = await db.collection('issues').insertOne(issue);
  const savedIssue = await db.collection('issues').findOne({ _id: result.insertedId });
  return savedIssue;
}

async function getNextSequence(name) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { current: 1 } },
    { returnOriginal: false ,upsert:true},
  );
  return result.value.current;
}

const server = new ApolloServer({
  typeDefs: fs.readFileSync('schema.graphql', 'utf-8'),
  resolvers,
  formatError: error => {
    console.log(error);
    return error;
  }
});

const app = express();

//app.use(express.static('public'));

server.applyMiddleware({ app, path: '/graphql' });
const port = process.env.API_SERVER_PORT || 3000;

async function connectToDb() {
  const client =new MongoClient(url, { useNewUrlParser: true,useUnifiedTopology: true });
  await client.connect();
  console.log('Connected to MongoDB at', url);
  db = client.db();
}

(async function () {
  try {
    await connectToDb();
    app.listen(3000, function () {
      console.log(`API Server started on port ${port}`);
    });
  } catch (err) {
      console.log('ERROR:', err);
    }
})();

