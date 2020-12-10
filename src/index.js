const { MongoClient } = require('mongodb')
const { Future } = require('./future')

var dbName = null

const race = (...p) => Promise.race(p)
const timeout = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms))
const connection = new Future();
const getClient = (timeout_ms) => race(timeout(timeout_ms || 1000), connection.value);

async function connect(url) {
	try {
		dbName = url.split("/")[3]; // TODO: parse the url and validate the db name
		var client = new MongoClient(url, { useUnifiedTopology: true });
		if( "timeout" == await race(timeout(2000, "timeout"), client.connect()) ) {
			connection.reject("timeout");
		} else {
			connection.resolve(client)
		}
	} catch(err) {
		connection.reject(err);
	}
}

const nop = () => {}
const emptyCursor = {
	hasNext: () => false,
	count: () => 0,
	projection: nop, next: nop, skip: nop, limit: nop, filter: nop, sort: nop, each: nop,
	toArray: (cb) => cb([])
}

const defaultDocOpts = {
	timeout: 1000,
	writeConcern: 1
}

//  Document is a meta-class that takes a collection name, and produces a base class you can extend.
module.exports.Document = function Document(collectionName, docOpts) {

	// setup the options for the new base class
	docOpts = Object.assign({}, defaultDocOpts, docOpts);
	// define a helper for accessing the collection supporting the base class
	const mongoOp = async (func) => {
		const client = await getClient();
		if( client == null ) throw new Error("Failed to connect to database");
		return race(
			timeout(docOpts.timeout, { result: { err: "timeout", ok: false }}),
			func(client.db(dbName).collection(collectionName))
		);
	}
	// define the new base class
	class BaseDocument {
		constructor(props) { Object.assign(this, props); }
		async save() {
			await mongoOp((coll) => '_id' in this
				? coll.updateOne({ _id: this._id }, { "$set": this }, { w: docOpts.writeConcern, upsert: true })
				: coll.insertOne(this, { w: docOpts.writeConcern }));
			return this;
		}
	}
	BaseDocument.fromObject = function(obj) {
		// when an object comes back from the database,
		// ops like findOne will call MyDocument.fromObject,
		// (not BaseDocument.fromObject!), so 'this' will be:
		// MyDocument, the target type of the data object,
		// so just decorate that data with this prototype.
		if (obj == null) return null;
		obj.__proto__ = this;
		return obj;
	}
	// define a series of database operations
	// available directly from your sub-class, eg:
	// class Foo extends Document('foos') { }
	// await Foo.deleteMany({});
	function db_hook(name, func) {
		// a lot of simple operations have the same form, so provide that as a default here
		// just wait for connection, do the thing, return the result
		if (func == null) func = (...args) => mongoOp((coll) => coll[name](...args));
		// must bind a real 'function' not a lambda, so that the context is passed as the sub-class type (eg, Foo, not BaseDocument)
		return BaseDocument[name] = async function (...args) { return func.apply(this, args); }
	}
	db_hook('count', (qry) => mongoOp((coll) => coll.countDocuments(qry)));
	BaseDocument.createIndex = BaseDocument.ensureIndex =
		db_hook('createIndexes');
	db_hook('updateOne');
	db_hook('updateMany');
	BaseDocument.remove = db_hook('deleteMany');
	db_hook('deleteOne');
	db_hook('findOne', async function findOne(qry) { // this has to be function, not lambda, so it will accept context from the caller
		return this.fromObject(await mongoOp((coll) => coll.findOne(qry)));
	});
	db_hook('find', async function find(qry, opts) {
		const client = await getClient();
		if( client == null ) throw new Error("Failed to connect to database.");
		const cursor = (await mongoOp((coll) => coll.find(qry, opts))) || emptyCursor;
		return { //  a fake Cursor that emits the proper type (klass, not raw mongo types)
			[Symbol.asyncIterator]: async* function() { while( cursor.hasNext() ) yield(this.fromObject((await(cursor.next())))); },
			projection: (args) => { cursor.projection(args); return this },
			skip:    (n)   => { cursor.skip(n); return this },
			limit:   (n)   => { cursor.limit(n); return this },
			count:   ()    => cursor.count(),
			filter:  (qry) => { cursor.filter(qry); return this },
			sort:    (key) => { cursor.sort(key); return this },
			next:    ()    => new Promise((resolve, reject) => cursor.next((item) => resolve(this.fromObject(item))).catch(reject)),
			each:    (cb)  => { cursor.each((item) => cb(this.fromObject(item))); return null },
			toArray: ()    => new Promise((resolve, reject) => cursor.toArray((items) => resolve(items.map((item) => this.fromObject(item)))).catch(reject)),
		}
	});
	db_hook('getOrCreate', async function(fields) {
		return (await race(timeout(docOpts.timeout), this.findOne(fields))) || this.fromObject(fields);
	});
	return BaseDocument;
}

module.exports.Document.connect = connect;

module.exports.Document.dropDatabase = async (name, opts) => {
	opts = Object.assign({ w: 1 }, opts);
	const client = await getClient();
	if( client == null ) throw new Error("failed to connect");
	return client.db(name).dropDatabase(opts)
};
