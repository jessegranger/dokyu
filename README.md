dokyu
-----

A little ORM for mongodb: ```npm install dokyu```

Basic Usage
===========

```javascript

const { Document } = require('dokyu');

Document.connect("mongodb://localhost:27017/example");

class MyDocument extends Document("my_collection") {
  constructor(name) {
    super();
    this.name = name;
  }
  greet() { return "Hello, "+this.name; }
}
MyDocument.createIndexes({ name: 1 }, { unique: true });

var doc = new MyDocument("Arthur");
doc.email = "arthur@camelot.com";
await doc.save(); // this will add the '_id' field to doc

var doc2 = await MyDocument.getOrCreate({ email: "arthur@camelot.com" })
doc2.name // will be "Arthur", from the database
doc2.greet() // will be "Hello, Arthur" from the prototype

```

API
===

* __Document.connect( [name], url )__

  The _url_ should be something like: ```"mongodb://localhost:27017/db_name"```.

  Any connection options supported by mongo can be given as URL params, ```"?replSet=rs0"```

* __Document( collectionName, [opts] )__ → class

  This creates a new base class, suitable only for extending.

  For instance, given `class Foo extends Document("foos")`,
  all instances of `Foo` will read/write to the `"foos"` collection,
  using whatever database you pass to `Document.connect`.

* __MyDocument.count( query )__ → Promise(number)

  The `count` value is the number of documents matching the query.

  ```javascript
  const count = await MyDocument.count( query );
  assert('number' == typeof count)
  ```

* __MyDocument.findOne( query )__  → Promise(doc)

  The `doc` value is the first matching instance of MyDocument.

  ```javascript
  const doc = await MyDocument.findOne({ name: "Adam" })
  doc.greet(); # "Hello, Adam"
  ```

* __MyDocument.getOrCreate( fields )__  → Promise(MyDocument)

  Example: `const doc = await MyDocument.getOrCreate({ name: "Adam" });`.

  In this example, if the query `findOne({ name: "Adam" })` returns no matches,
  then the query is converted to a new `MyDocument` object and returned.

  The query should be limited to only simple matches, with names and values
  intended for direct inclusion in a new document. If you need more complex
  query features like ranges, use `findOne(query)` directly.

* __MyDocument.find( query, opts )__ → Promise(cursor)

  The `cursor` given here is a proxy cursor that emits objects of the proper type.
  - `projection(fields)` → `cursor`, limit the fields fetched on each item.
  - `next()` → `MyDocument`, return a Promise that resolves to the next item, once it's available, or null if the cursor is empty.
  - `skip(n)` → `cursor`, skip some items in the cursor.
  - `limit(n)` → `cursor`, read at most `n` items.
  - `filter(qry)` → `cursor`, only emit items that match the query object.
  - `sort(keys)` → `cursor`, sort the results of the cursor.
  - `count()` → `number`, return the number of items available to the cursor.
  - `each(cb)` → `cursor`, calls `cb(doc)` for every result, each doc is an instance of MyDocument.
  - `toArray(cb)` → `cursor`, calls `cb(array)`, with an array of MyDocument instances.
  - `[Symbol.asyncIterator]`, the cursor can be read in a `for await (const item in cursor)` loop.

* __MyDocument.updateOne( query, update, [opts] )__ → Promise(UpdateResult)

* __MyDocument.updateMany( query, update, [opts] )__ → Promise(UpdateResult)

* __MyDocument.deleteOne( query, [opts] )__ → Promise(DeleteResult)

* __MyDocument.deleteMany( query, [opts] )__ → Promise(DeleteResult)

* __MyDocument.remove( query, [opts] )__ → Promise(DeleteResult)

  Deprecated. Same as `deleteMany`.

* __MyDocument.createIndexes( fields, opts )__ → Promise(IndexResult)

  Example: `MyDocument.createIndexes({ name: 1 }, { unique: true })`.


