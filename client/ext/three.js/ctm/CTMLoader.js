/**
 * Loader for CTM encoded models generated by OpenCTM tools:
 *	http://openctm.sourceforge.net/
 *
 * Uses js-openctm library by Juan Mellado
 *	http://code.google.com/p/js-openctm/
 *
 * @author alteredq / http://alteredqualia.com/
 */

THREE.CTMLoader = function ( showStatus ) {

	THREE.Loader.call( this, showStatus );

};

THREE.CTMLoader.prototype = Object.create( THREE.Loader.prototype );

// Load multiple CTM parts defined in JSON

THREE.CTMLoader.prototype.loadParts = function( url, callback, parameters ) {

	parameters = parameters || {};

	var scope = this;

	var xhr = new XMLHttpRequest();

	var basePath = parameters.basePath ? parameters.basePath : this.extractUrlBase( url );

	xhr.onreadystatechange = function() {

		if ( xhr.readyState === 4 ) {

			if ( xhr.status === 200 || xhr.status === 0 ) {

				var jsonObject = JSON.parse( xhr.responseText );

				var materials = [], geometries = [], counter = 0;

				function callbackFinal( geometry ) {

					counter += 1;

					geometries.push( geometry );

					if ( counter === jsonObject.offsets.length ) {

						callback( geometries, materials );

					}

				}


				// init materials

				for ( var i = 0; i < jsonObject.materials.length; i ++ ) {

					materials[ i ] = THREE.Loader.prototype.createMaterial( jsonObject.materials[ i ], basePath );

				}

				// load joined CTM file

				var partUrl = basePath + jsonObject.data;
				var parametersPart = { useWorker: parameters.useWorker, useBuffers: parameters.useBuffers, offsets: jsonObject.offsets };
				scope.load( partUrl, callbackFinal, parametersPart );

			}

		}

	}

	xhr.open( "GET", url, true );
	xhr.setRequestHeader( "Content-Type", "text/plain" );
	xhr.send( null );

};

// Load CTMLoader compressed models
//	- parameters
//		- url (required)
//		- callback (required)

THREE.CTMLoader.prototype.load = function( url, callback, parameters ) {

	parameters = parameters || {};

	var scope = this;

	var offsets = parameters.offsets !== undefined ? parameters.offsets : [ 0 ];
	var useBuffers = parameters.useBuffers !== undefined ? parameters.useBuffers : true;

	var xhr = new XMLHttpRequest(),
		callbackProgress = null;

	var length = 0;

	xhr.onreadystatechange = function() {

		if ( xhr.readyState === 4 ) {

			if ( xhr.status === 200 || xhr.status === 0 ) {

				var binaryData = new Uint8Array(xhr.response);

				var s = Date.now();

				if ( parameters.useWorker ) {

					var worker = new Worker( HackCTMWorkerURL );

					worker.onmessage = function( event ) {

						var files = event.data;

						for ( var i = 0; i < files.length; i ++ ) {

							var ctmFile = files[ i ];

							var e1 = Date.now();
							// console.log( "CTM data parse time [worker]: " + (e1-s) + " ms" );

							if ( useBuffers ) {

								scope.createModelBuffers( ctmFile, callback );

							} else {

								scope.createModelClassic( ctmFile, callback );

							}

							var e = Date.now();
							console.log( "model load time [worker]: " + (e-e1) + " ms, total: " + (e-s));

						}


					};

					worker.postMessage( { "data": binaryData, "offsets": offsets } );

				} else {

					for ( var i = 0; i < offsets.length; i ++ ) {

						var stream = new CTM.Stream( binaryData );
						stream.offset = offsets[ i ];

						var ctmFile = new CTM.File( stream );

						if ( useBuffers ) {

							scope.createModelBuffers( ctmFile, callback );

						} else {

							scope.createModelClassic( ctmFile, callback );

						}

					}

					//var e = Date.now();
					//console.log( "CTM data parse time [inline]: " + (e-s) + " ms" );

				}

			} else {

				console.error( "Couldn't load [" + url + "] [" + xhr.status + "]" );

			}

		} else if ( xhr.readyState === 3 ) {

			if ( callbackProgress ) {

				if ( length === 0 ) {

					length = xhr.getResponseHeader( "Content-Length" );

				}

				callbackProgress( { total: length, loaded: xhr.responseText.length } );

			}

		} else if ( xhr.readyState === 2 ) {

			length = xhr.getResponseHeader( "Content-Length" );

		}

	}

	xhr.open( "GET", url, true );
	xhr.responseType = "arraybuffer";

	xhr.send( null );

};


THREE.CTMLoader.prototype.createModelBuffers = function ( file, callback ) {

	var Model = function ( ) {

		var scope = this;

		scope.materials = [];

		THREE.BufferGeometry.call( this );

		// init GL buffers
		var vertexIndexArray = file.body.indices,
		vertexPositionArray = file.body.vertices,
		vertexNormalArray = file.body.normals;

		var vertexUvArray, vertexColorArray;

		if ( file.body.uvMaps !== undefined && file.body.uvMaps.length > 0 ) {
			vertexUvArray = file.body.uvMaps[ 0 ].uv;
		}

		if ( file.body.attrMaps !== undefined && file.body.attrMaps.length > 0 && file.body.attrMaps[ 0 ].name === "Color" ) {
			vertexColorArray = file.body.attrMaps[ 0 ].attr;
		}

		// attributes
		var attributes = scope.attributes;

		attributes[ "index" ]    = { itemSize: 1, array: vertexIndexArray };
		attributes[ "position" ] = { itemSize: 3, array: vertexPositionArray };

		if ( vertexNormalArray !== undefined ) 
			attributes[ "normal" ] = { itemSize: 3, array: vertexNormalArray };

		if ( vertexUvArray !== undefined ) 
			attributes[ "uv" ] = { itemSize: 2, array: vertexUvArray };

		if ( vertexColorArray !== undefined ) 
			attributes[ "color" ]  = { itemSize: 4, array: vertexColorArray };
	}

	Model.prototype = Object.create( THREE.BufferGeometry.prototype );

	var geometry = new Model();

	geometry.computeOffsets();

	// compute vertex normals if not present in the CTM model
	if ( geometry.attributes[ "normal" ] === undefined ) {
		geometry.computeVertexNormals();
	}

	callback( geometry );

};

THREE.CTMLoader.prototype.createModelClassic = function ( file, callback ) {

	var Model = function ( ) {

		var scope = this;

		scope.materials = [];

		THREE.Geometry.call( this );

		var normals = [],
			uvs = [],
			colors = [];

		init_vertices( file.body.vertices );

		if ( file.body.normals !== undefined )
			init_normals( file.body.normals );

		if ( file.body.uvMaps !== undefined && file.body.uvMaps.length > 0 )
			init_uvs( file.body.uvMaps[ 0 ].uv );

		if ( file.body.attrMaps !== undefined && file.body.attrMaps.length > 0 && file.body.attrMaps[ 0 ].name === "Color" )
			init_colors( file.body.attrMaps[ 0 ].attr );

		var hasNormals = normals.length > 0 ? true : false,
			hasUvs = uvs.length > 0 ? true : false,
			hasColors = colors.length > 0 ? true : false;

		init_faces( file.body.indices );

		this.computeCentroids();
		this.computeFaceNormals();
		//this.computeTangents();

		function init_vertices( buffer ) {

			var x, y, z, i, il = buffer.length;

			for( i = 0; i < il; i += 3 ) {

				x = buffer[ i ];
				y = buffer[ i + 1 ];
				z = buffer[ i + 2 ];

				vertex( scope, x, y, z );

			}

		};

		function init_normals( buffer ) {

			var x, y, z, i, il = buffer.length;

			for( i = 0; i < il; i += 3 ) {

				x = buffer[ i ];
				y = buffer[ i + 1 ];
				z = buffer[ i + 2 ];

				normals.push( x, y, z );

			}

		};

		function init_colors( buffer ) {

			var r, g, b, a, i, il = buffer.length;

			for( i = 0; i < il; i += 4 ) {

				r = buffer[ i ];
				g = buffer[ i + 1 ];
				b = buffer[ i + 2 ];
				a = buffer[ i + 3 ];

				var color = new THREE.Color();
				color.setRGB( r, g, b );

				colors.push( color );

			}

		};


		function init_uvs( buffer ) {

			var u, v, i, il = buffer.length;

			for( i = 0; i < il; i += 2 ) {

				u = buffer[ i ];
				v = buffer[ i + 1 ];

				uvs.push( u, v );

			}

		};

		function init_faces( buffer ) {

			var a, b, c,
				u1, v1, u2, v2, u3, v3,
				m, face,
				i, il = buffer.length;

			m = 0; // all faces defaulting to material 0

			for( i = 0; i < il; i += 3 ) {

				a = buffer[ i ];
				b = buffer[ i + 1 ];
				c = buffer[ i + 2 ];

				if ( hasNormals ){

					face = f3n( scope, normals, a, b, c, m, a, b, c );

				} else {

					face = f3( scope, a, b, c, m );

				}

				if ( hasColors ) {

					face.vertexColors[ 0 ] = colors[ a ];
					face.vertexColors[ 1 ] = colors[ b ];
					face.vertexColors[ 2 ] = colors[ c ];

				}

				if ( hasUvs ) {

					u1 = uvs[ a * 2 ];
					v1 = uvs[ a * 2 + 1 ];

					u2 = uvs[ b * 2 ];
					v2 = uvs[ b * 2 + 1 ];

					u3 = uvs[ c * 2 ];
					v3 = uvs[ c * 2 + 1 ];

					uv3( scope.faceVertexUvs[ 0 ], u1, v1, u2, v2, u3, v3 );

				}

			}

		}

	};

	function vertex ( scope, x, y, z ) {

		scope.vertices.push( new THREE.Vector3( x, y, z ) );

	};

	function f3 ( scope, a, b, c, mi ) {

		var face = new THREE.Face3( a, b, c, null, null, mi );

		scope.faces.push( face );

		return face;

	};

	function f3n ( scope, normals, a, b, c, mi, nai, nbi, nci ) {

		var nax = normals[ nai * 3     ],
			nay = normals[ nai * 3 + 1 ],
			naz = normals[ nai * 3 + 2 ],

			nbx = normals[ nbi * 3     ],
			nby = normals[ nbi * 3 + 1 ],
			nbz = normals[ nbi * 3 + 2 ],

			ncx = normals[ nci * 3     ],
			ncy = normals[ nci * 3 + 1 ],
			ncz = normals[ nci * 3 + 2 ];

		var na = new THREE.Vector3( nax, nay, naz ),
			nb = new THREE.Vector3( nbx, nby, nbz ),
			nc = new THREE.Vector3( ncx, ncy, ncz );

		var face = new THREE.Face3( a, b, c, [ na, nb, nc ], null, mi );

		scope.faces.push( face );

		return face;

	};

	function uv3 ( where, u1, v1, u2, v2, u3, v3 ) {

		var uv = [];
		uv.push( new THREE.Vector2( u1, v1 ) );
		uv.push( new THREE.Vector2( u2, v2 ) );
		uv.push( new THREE.Vector2( u3, v3 ) );
		where.push( uv );

	};

	Model.prototype = Object.create( THREE.Geometry.prototype );

	callback( new Model() );

};
