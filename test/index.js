Util = require('util');

const { suite, test, suiteSetup, suiteTeardown, assert } = require('test-units');

const { Document } = require('../src/index');

const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const randomString = (len, prefix = "") => {
	while (prefix.length < len) prefix += alphabet[Math.floor(random() * alphabet.length)];
	return prefix;
}

suite('Document timeout', () => {
	test('times out if not connected', { shouldFail: true }, async () => {
		class Foo extends Document("foos") {
			constructor(props) { super(props) }
		}
		await Foo.findOne({})
	});
});

suite('Document', () => {

	suiteSetup(() => Document.connect("mongodb://localhost:27017/document_test"));

	suiteTeardown(async () => {
		await Document.dropDatabase("document_test");
		process.exit(0);
	});

	test('exports Document', function() {
		assert.notEqual(Document, null);
	});

	test('can be extended', async () => {
		class Foo extends Document("foos") {
			constructor(name) {
				super();
				this.name = name;
			}
			greet() { return "Hello, " + this.name; }
		}
		var f = new Foo("Adam");
		assert.equal(f.name, "Adam")
		assert.equal(f.greet(), "Hello, Adam");
		assert(!('_id' in f), "Item should not have _id yet");
		await f.save()
		assert('_id' in f);
	});

	test('can be saved more than once', async () => {
		class Foo extends Document("foos") {
			constructor(name) {
				super();
				this.name = name;
			}
			greet() { return "Hello, " + this.name; }
		}
		const f = new Foo("Bob");
		assert(!('_id' in f));
		const result = await f.save();
		assert('_id' in f);
		f.magic = randomString(10);
		await f.save();
		const g = await Foo.getOrCreate({ name: "Bob" });
		assert.equal(g.magic, f.magic);
	})

	test('can use a unique index', { shouldFail: true }, async () => {
		class Bar extends Document("bars") {
			constructor(name) {
				super()
				this.name = name;
			}
		}
		await Bar.createIndexes({ name: 1 }, { unique: true });
		await Bar.deleteMany({});
		const bill = new Bar("Bill");
		const bob = new Bar("Bob");
		await bill.save();
		assert.notEqual(bill._id, null);
		await bob.save();
		assert.notEqual(bob._id, null);
		await new Bar("Bill").save();
	})

	test('getOrCreate', async () => {
		class Baz extends Document("bazs") {
			constructor(props) { super(props) }
		}
		await Baz.deleteMany({});
		var docs = []
		for(var i = 0; i < 10; i++) {
			docs.push(new Baz({ x: i, xx: i * i }).save());
		}
		await Promise.all(docs);
		var doc = await Baz.getOrCreate({ x: 7 });
		assert.equal(doc.xx, 7*7);
	});

	test('save returns the saved document', async () => {
		class Saved extends Document("saved") {
			constructor() {
				super();
				this.value = randomString(10);
			}
		}
		const s = new Saved();
		assert(!('_id' in s));
		const doc = await s.save();
		assert('_id' in doc);
		assert.equal(doc._id, s._id);
	})

});

