
# Our very own tiny database layer.

$ = require 'bling'
Mongo = require 'mongodb'
{MongoClient, ObjectID} = Mongo

# teach bling how to deal with some mongo objects
$.type.register 'ObjectId',
	is: (o) -> o and o._bsontype is "ObjectID"
	string: (o) -> (o and o.toHexString()) or String(o)
	repr: (o) -> "ObjectId('#{o.toHexString()}')"

$.type.register 'cursor',
	is: (o) -> o and o.cursorState?
	string: (o) -> "Cursor(#{$.as 'string', o.cursorState.cursorId})"

$.type.register 'WriteResult',
	is: (o) -> o and o.result?.ok? and o.connection?
	string: (o) -> "WriteResult(ok=#{o.result.ok}, n=#{o.result.n})"
	repr: (o) -> "WriteResult({ ok: #{o.result.ok}, n: #{o.result.n}})"

connections = Object.create null
collections = Object.create null

default_namespace = "/"

# db is the public way to construct a db object,
# expects to (eventually) use a promise from the connections map
db = (ns = default_namespace) ->
	createCollection: (name, opts, cb) ->
		opts = $.extend {}, opts, { safe: true }
		log = $.logger "db.createCollection('#{name}', #{$.as 'repr', opts}, cb)"
		key = ns + ":" + name
		unless ns of connections then log "error - db: not connected: #{ns}"
		else if key of collections then log "error - db: createCollection already exists:", name
		else
			# log "waiting for connection..."
			connections[ns].wait (err, _db) ->
				if err then return log err
				# log "connected..."
				_db.createCollection name, opts, (err) ->
					collections[key] = _db.collection(name)
					cb? err
	collection: (_coll) ->
		o = (_op, _touch) -> (args...) -> # wrap a native operation with a promise
			log = $.logger "db.#{_coll}.#{_op}(#{$(args).map($.partial $.as, 'string').join ", "})"
			p = $.Promise()
			if $.is 'function', $(args).last()
				p.wait args.pop()
			# log "starting"
			unless ns of connections then p.fail "namespace not connected: #{ns}"
			else
				fail_or = (pass) -> (e, r) ->
					if e then return p.fail(e)
					try pass(r) catch err
						log "failed in callback", p.promiseId, $.debugStack err.stack
				connections[ns].wait fail_or (_db) ->
					# log "--> to MongoClient...", _db?.constructor
					_db.collection(_coll)[_op] args..., fail_or (result) ->
						# log "<-- from MongoClient:", $.as 'string', result
						p.resolve result
			return _touch?(p) ? p
		# Wrap these native operations:
		findOne:     o 'findOne'     # (qry, [fields], cb)
		find:        o 'find'        # (qry, [fields], [opts], cb)
		count:       o 'count'       # (qry, [opts], cb)
		insert:      o 'insert'      # (doc, [opts], cb)
		update:      o 'update'      # (qry, update, [opts], cb)
		save:        o 'save'        # (obj, [opts], cb)
		remove:      o 'remove'      # (qry, [opts], cb)
		ensureIndex: o 'ensureIndex' # (obj, [opts], cb)
		stream: (query, cb) ->
			log = $.logger "db.#{_coll}.stream(#{$.as 'string', query})"
			unless ns of connections then cb new Error "namespace not connected: #{ns}"
			else connections[ns].wait (err, _db) =>
				key = ns + ":" + _coll
				# log "stream: starting...", key, query
				if err then cb(err)
				else unless key of collections
					log "stream: waiting for connection..."
					$.delay 300, => @stream query, cb
				else
					try
						# log "stream: query...", query
						do openStream = ->
							stream = collections[key].find(query, {
								tailable: true,
								awaitData: true,
								noTimeout: true,
								numberOfRetries: -1
							}).stream()
							_emit = stream.emit
							stream.emit = ->
								console.log "stream.emit", arguments...
								_emit.apply stream, arguments
							stream.on 'error', (err) ->
								log "error", err
								cb err, null
							stream.on 'data', (doc) ->
								cb null, doc
							stream.on 'close', ->
								# log "stream: close", arguments
								$.delay 500, openStream
					catch err
						log "caught", err
						cb err, null

db.connect = (args...) ->
	url = args.pop()
	ns = if args.length then args.pop() else default_namespace
	connections[ns] = $.extend p = $.Promise(),
		ns: ns
		url: url
	new MongoClient(url, {}).connect (err, client) ->
		parsed = $.URL.parse(url)
		dbName = parsed.path.split('/')[1]
		if err then p.reject(err) else p.resolve(client.db(dbName))
	p.wait (err) ->
		if err then $.log "connection error:", err

db.disconnect = (ns = default_namespace) ->
	connections[ns]?.then (_db) -> _db.close()

db.ObjectId = Mongo.ObjectID

module.exports.db = db
