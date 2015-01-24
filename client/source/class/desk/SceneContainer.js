/**
* A widget containing a THREE.scene to visualize 3D meshes
* 
* @asset(desk/camera-photo.png)
* @asset(qx/icon/${qx.icontheme}/16/categories/system.png) 
* @ignore(THREE.*)
* @ignore(requestAnimationFrame)
* @ignore(Detector)
* @ignore(Uint8Array)
* @lint ignoreDeprecated(alert)
* @ignore(desk.MeshTools)
* @ignore (async.*)
* @ignore (_.*)
* @ignore (Float32Array)
*/
qx.Class.define("desk.SceneContainer", 
{
    extend : desk.ThreeContainer,
	include : desk.LinkMixin,

	/** 
	 * constructor
	 * @param file {String} file to open
	 * @param opts {Object} options, see desk.SceneContainer.addFile()
	 * @param callback {Function} callback when done
	 * @param context {Object} optional context for the callback
	 */
	construct : function(file, opts, callback, context) {
        this.base(arguments);
		qx.Class.include(qx.ui.treevirtual.TreeVirtual, qx.ui.treevirtual.MNode);
		if (typeof opts === "function") {
			callback = opts;
			context = callback;
			opts = {};
		}
		opts = opts || {};

		if (opts.convertVTK !== undefined) {
			this.setConvertVTK(opts.convertVTK);
		}

		var leftContainer = this.__leftContainer = new qx.ui.container.Composite();
		leftContainer.setLayout(new qx.ui.layout.VBox());
		this.add(leftContainer, {left : 0, top : 30});
		leftContainer.setVisibility("excluded");

		this.addListener("mousedown", this.__onMouseDown, this);
		this.addListener("mousemove", this.__onMouseMove, this);
		this.addListener("mouseup", this.__onMouseUp, this);
		this.addListener("mousewheel", this.__onMouseWheel, this);

		this.addListener('keydown', function (event) {
			if ((event.getTarget() !== this.getCanvas()) ||
                (event.getKeyIdentifier() !== 'G')) {
					return;
			}

			var mesh = this.__pickMeshes(this.getMeshes());
			if (mesh === Infinity) return;
			console.log("picked mesh : ");
			console.log(mesh);
			var controls = this.getControls();
			var init = controls.target.clone();
			var fin = mesh.point.clone();
			var current = init.clone();
			var count = 0;
			var nFrames = 30;
			async.whilst(
				function () { return count < nFrames; },
				function (callback) {
					controls.target.addVectors(
						fin.clone().multiplyScalar(count / nFrames),
						init.clone().multiplyScalar(1 - (count / nFrames))
						);
					controls.update();
					this.render();
					setTimeout(callback, 10);
					count++;
					this.__propagateLinks();
				}.bind(this),
				function () {}
			);

		}, this);


		var button = new qx.ui.form.Button("+").set({opacity : 0.5, width : 30});
		this.add (button, {left : 0, top : 0});
		button.addListener("execute", function () {
			if (leftContainer.getVisibility() === "visible") {
				leftContainer.setVisibility("excluded");
				button.setLabel("+");
			} else {
				leftContainer.setVisibility("visible");
				button.setLabel("-");
				var ren = this.__meshes.getDataRowRenderer();
				var color = this.getRenderer().getClearColor();
				var colors = ren._colors;
				colors.colNormal = "rgb(" + (255 * (1 - color.r)) + "," +
					(255 * (1 - color.g)) + "," + (255 * (1 - color.b)) + ")";
				colors.bgcolEven = colors.bgcolOdd = colors.horLine = "transparent";
				colors.bgcolFocused = "rgba(249, 249, 249, 0.5)";
				colors.bgcolFocusedSelected = "rgba(60, 100, 170, 0.5)";
				colors.bgcolSelected = "rgba(51, 94, 168, 0.5)";
			}
		}, this);

		var buttons = new qx.ui.container.Composite(new qx.ui.layout.HBox());
		buttons.add(this.__getDragLabel(), {flex : 1});
		buttons.add(this.__getSaveViewButton(), {flex : 1});
		buttons.add(this.__getResetViewButton(), {flex : 1});
		buttons.add(this.__getSnapshotButton());
		buttons.add(this.__getCameraPropertiesButton());
		leftContainer.add(buttons);

		this.__meshes = new qx.ui.treevirtual.TreeVirtual(["meshes"]);
		this.__meshes.setBackgroundColor("transparent");
		this.__meshes.setSelectionMode(qx.ui.treevirtual.TreeVirtual.SelectionMode.MULTIPLE_INTERVAL);
		this.__meshes.set({
			width  : 180,
			rowHeight: 22,
			columnVisibilityButtonVisible : false,
            statusBarVisible : false		
		});

        leftContainer.add(this.__meshes,{flex : 1});
//		leftContainer.add(this.__getFilterContainer());

		this.__meshes.setContextMenu(this.__getContextMenu());

		if (THREE.CTMLoader) {
			this.__ctmLoader = new THREE.CTMLoader(this.getRenderer().context);
		}
		this.__vtkLoader = new THREE.VTKLoader();

		this.__queue = async.queue(this.__urlLoad.bind(this), 10);

		this.__setData = _.throttle(this.__meshes.getDataModel().setData.
			bind(this.__meshes.getDataModel()), 500);

		if (file) {
			this.addFile(file, opts, callback, context);
		}
		this.__addDropSupport();
	},

	destruct : function(){
		this.__setData = function () {};
		qx.util.DisposeUtil.destroyContainer(this.__leftContainer);
		this.removeAllMeshes();
		this.unlink();
		this.__meshes.dispose();
		this.__meshes.getDataModel().dispose();
		this.__ctmLoader = null;
	},

	properties : {
		/**
		 * if true, .vtk files will be converted to .ctm files before loading
		 */
		convertVTK : {init : true, check: "Boolean"},
		
		/**
		 * allows picking with mouse instead of rotation, pan, etc..
		 */
		 pickMode : {init : false, check: "Boolean"}
	},

	events : {
		/**
		 * Fired whenever a mesh is removed. Attached data is the removed mesh
		 */
		"meshRemoved" : "qx.event.type.Data",
		/**
		 * Fired whenever picking is performed (in pick mode only)
		 */
		"pick" : "qx.event.type.Data"
		},

	members : {
		// a treeVirtual element storing all meshes
		__meshes : null,

		// a async.queue to load meshes
		__queue : null,

		// a THREE.VTKLoader
        __vtkLoader : null,

		// a THREE.CTMLLoader
        __ctmLoader : null,

		__setData : null,

		__leftContainer : null,

		/**
		 * Returns the objects handled in the scene
		 * @return {Array} array of objects 
		 */
		getMeshes : function() {
			var meshes = [];
			if (!this.getScene()) return [];
			this.getScene().traverse(function(child) {
				if (child.userData.viewerProperties) {
					meshes.push(child);
				}
			});
			return meshes;
		},

		/**
		 * Creates a leaf in the tree
		 * @param opt {Object} possible options : parent, branch (true/false)
		 *  label
		 * @return {Integer} leaf id
		 */
        __addLeaf : function (opt) {
			opt = opt || {};
			opt.label = opt.label || "mesh";
			if (opt.parent) {
				var parent = opt.parent.userData.viewerProperties.leaf;
			}
			var func = opt.branch ? "addBranch" : "addLeaf";
			var leaf = this.__meshes.getDataModel()[func](parent, opt.label, null);
			this.__setData();
			return leaf;
		},

		/**
		 * Returns the object corresponding to the node
		 * @param node {Object} node
		 * @return {THREE.Object3D} object
		 */
		__getMeshFromNode : function (node) {
			var leaf = this.__meshes.nodeGet(node);
			return leaf && leaf.viewerProperties && leaf.viewerProperties.mesh;
		},

		/**
		 * Adds a mesh to the scene
		 * @param mesh {THREE.Object3D} object to add
		 * @param opt {Object} options
		 */
		addMesh : function (mesh, opt) {
			opt = opt || {};
			(opt.parent || this.getScene()).add(mesh);
			var leaf = opt.leaf = opt.leaf || this.__addLeaf(opt);
			opt.mesh = mesh;
			this.__meshes.nodeGet(leaf).viewerProperties = opt;
			mesh.userData.viewerProperties = opt;
			if (opt.updateCamera !== false) {
				this.viewAll();
			}
		},

		/**
		 * Creates the filter container
		 * @return {qx.ui.container.Composite} the container
		 */
		__getFilterContainer : function () {
			var dataModel = this.__meshes.getDataModel();
			var container = new qx.ui.container.Composite();
			container.setLayout(new qx.ui.layout.HBox(10));
			var filterText = new qx.ui.basic.Label("search");
			container.add(filterText);

			var filterField = new qx.ui.form.TextField();
			filterField.set({value : "", backgroundColor : "transparent"});
			filterField.addListener("input", function() {
				this.__meshes.getDataModel().setData()
				this.render();
			}, this);
			container.add(filterField);

			var filter = qx.lang.Function.bind(function(node) {
				if (node.type == qx.ui.treevirtual.MTreePrimitive.Type.LEAF) {
					var label = node.label;
					var mesh = this.__getMeshFromNode(node);
					var visibility = false;
					if (label.toLowerCase().indexOf(filterField.getValue().toLowerCase()) != -1) {
						visibility = true;
					}
					if (mesh) {
						mesh.visible = visibility;
					}
					return visibility;
				}
				return true;
			}, this);

			var resetButton = new qx.ui.form.Button("Reset filter");
			resetButton.setAllowGrowY(false);
			resetButton.addListener("execute",function(e){
				filterField.setValue("");
			}, this);

			container.add(resetButton);
			dataModel.setFilter(filter);
			return container;
		},

		/**
		 * reads the file
		 * @param file {String} file to read
		 * @param opt {Object} options
		 * @param callback {Function} callback when done
		 */
		__readFile : function (file, opt, callback) {
            opt = opt || {};
            opt.leaf = this.__addLeaf({parent : opt.parent,
				label : opt.label || desk.FileSystem.getFileName(file)});

			switch (desk.FileSystem.getFileExtension(file)) {
            case "vtk":
				if (!this.isConvertVTK() || opt.convert === false) {
					this.__loadFile(file, opt, callback);
					break;
				}
			case "ply":
			case "obj":
			case "stl":
			case "off":
				desk.Actions.getInstance().launchAction({
                    "action" : "mesh2ctm",
					"input_mesh" : file},
                    function (response) {
                       var outputDir = response.outputDirectory;
                        opt.mtime = response.MTime;
                        this.__loadFile(outputDir + '/mesh.ctm', opt, callback);
				}, this);
				break;

			case "ctm":
				this.__loadFile(file, opt, callback);
				break;
			default : 
				alert("error : file " + file + " cannot be displayed by mesh viewer");
			}
		},

		/**
		 * loads a file
		 * @param file {String} file to read
		 * @param opt {Object} options
		 * @param callback {Function} callback when done
		 */
		__loadFile : function (file, opt, callback) {
			opt.mtime = opt.mtime || Math.random();
			opt.url = desk.FileSystem.getFileURL(file);
			this.loadURL(opt, callback);
		},

		/**
		 * reloads all loaded objects
		 */
		update : function () {
			var files = [];
			this.getMeshes().forEach(function (mesh) {
				if (mesh.userData.viewerProperties.file) {
					files.push(mesh.userData.viewerProperties.file);
				}
			});
			this.removeAllMeshes();
			this.__meshes.getDataModel().clearData();
			files.forEach(function (file) {this.addFile(file);}, this);
		},

		/**
		 * reloads all loaded objects
		 */
		 __propagateLinks : function () {
			this.getLinks().forEach(function (link) {
				if (this === link) {return;}
				link.getControls().copy(this.getControls());
				link.render();
			}, this);
		},

		/**
		 * Removes all meshes in the scene
		 * @param dispose {Boolean} dispose meshes to avoid memory leaks (default : true)
		 */
		removeAllMeshes : function (dispose) {
			this.removeMeshes(this.getMeshes(), dispose);
		},

		/**
		 * parses xml data
		 * @param file {String} the read file
		 * @param xml {Element} the xml tree
		 * @param opts {Object} options
		 * @param callback {Function} callback when done
		 */
		 __parseXMLData : function (file, xml, opts, callback) {
			var root = xml.childNodes[0];
			opts.mtime = root.hasAttribute("timestamp")?
				parseFloat(root.getAttribute("timestamp")) : Math.random();

			var dataModel = this.__meshes.getDataModel();
			var leaf = dataModel.addBranch(null, desk.FileSystem.getFileName(file), null);
			this.__setData();
			var object = new THREE.Object3D();
			opts.leaf = leaf;
			opts.file = file;
			this.addMesh(object, opts);

			var path = desk.FileSystem.getFileDirectory(file);
			async.each(xml.getElementsByTagName("mesh"), function (mesh, callback) {
				var meshParameters = {parent : object};
				if (mesh.hasAttribute("color")) {
					var color = mesh.getAttribute("color").split(" ").map(
						function (color) {
							return parseFloat(color);
						}
					);
					meshParameters.color = color;
					meshParameters.renderDepth = color[4];
				}

				if (mesh.hasAttribute("Mesh")) {
					var xmlName = mesh.getAttribute("Mesh");
				} else {
					xmlName = mesh.getAttribute("mesh");
				}
				this.__readFile(path + "/" + xmlName, meshParameters,
					function () {callback();});
			}.bind(this), function () {
				callback(object);
			});
		},

		/**
		 * Loads a file in the scene.
		 * @param file {String} input file
		 * @param opts {Object} options
		 * @param callback {Function} callback when done
		 * @param context {Object} optional context for the callback
		 */
		addFile : function (file, opts, callback, context) {
			if (typeof opts === "function") {
				callback = opts;
				context = callback;
				opts = {};
			}
			opts = opts || {};
			callback = callback || function () {};

            opts.file = file;

			function after (mesh) {callback.call(context, mesh);}

			switch (desk.FileSystem.getFileExtension(file)) {
				case "ply":
				case "obj":
				case "stl":
				case "vtk":
				case "ctm":
				case "off":
					this.__readFile (file, opts, after);
					break;
				case "xml":
					desk.FileSystem.readFile(file, function (error, result){
						if (error) {
							alert("Error while reading " + file + "\n" + error);
							throw (error);
						}
						this.__parseXMLData(file, result, opts, after);
					}, this);
					break;
				case "json" : 
					desk.FileSystem.readFile(file, function (error, result){
						if (error) {
							alert("Error while reading " + file + "\n" + error);
							throw (error);
						}
						if (result.viewpoint) {
							var controls = this.getControls();
							controls.setState(result.viewpoint);
							setTimeout(function () {
								this.render();
								this.__propagateLinks();
							}.bind(this), 50);
						};
					}, this);
					break;
				default : 
					alert ("error : meshviewer cannot read " + file);
					break;
			}
		},

		/**
		 * Attaches a set of desk.VolumeSlice to the scene
		 * @param volumeSlices {Array} Array of deskVolumeSlice;
		 * @return {Array} array of THREE.Mesh
		 */
		attachVolumeSlices : function (volumeSlices) {
			return volumeSlices.map(function (slice) {
				return this.attachVolumeSlice(slice);
			}, this);
		},

		/**
		 * Attaches a set of desk.VolumeSlice to the scene
		 * @param volumeSlice {desk.VolumeSlice} volume slice to attach;
		 * @param opts {Object} options;
		 * @return {THREE.Mesh} the created mesh;
		 */
		attachVolumeSlice : function (volumeSlice, opts) {
			opts = opts || {};
			var geometry = new THREE.PlaneBufferGeometry( 1, 1);
			var material = volumeSlice.getMaterial();
			material.side = THREE.DoubleSide;
			var mesh = new THREE.Mesh(geometry,material);

			var listenerId = volumeSlice.addListener('changeImage', function () {
				var coords = volumeSlice.getCornersCoordinates();
				var vertices = geometry.attributes.position;
				for (var i = 0; i < 4 * 3; i++) {
					vertices.array[i] = coords[i];
				}
				vertices.needsUpdate = true;
				geometry.computeBoundingBox();
				geometry.computeFaceNormals();
				geometry.computeBoundingSphere();
				var vertices2 = lineGeometry.attributes.position;
				[0, 1, 3, 2, 0].forEach(function (i, j) {
					vertices2.copyAt(j, vertices, i);
				});
				vertices2.needsUpdate = true;
				this.render(true);
			}, this);

			this.addMesh(mesh, {label : 'View ' + (volumeSlice.getOrientation()+1),
				volumeSlice : volumeSlice, updateCamera : false, parent : opts.parent
			});

			var lineMaterial = new THREE.LineBasicMaterial({linewidth: 3,
				color: desk.VolumeSlice.COLORS[volumeSlice.getOrientation()]});

			var lineGeometry = new THREE.BufferGeometry();
			var positions = new Float32Array( 5 * 3 );
			lineGeometry.addAttribute('position', new THREE.BufferAttribute( positions, 3 ) );
			var line = new THREE.Line ( lineGeometry, lineMaterial );
			mesh.add(line);

			volumeSlice.fireEvent('changeImage');

			mesh.addEventListener("removedFromScene", function () {
				volumeSlice.removeListenerById(listenerId);
				lineGeometry.dispose();
				lineMaterial.dispose();
			});
			return mesh;
		},

		/**
		 * Attaches a volume to the scene. The volume wil be represented 
		 *  by its three orthogonal slices
		 * @param file {String} volume file
		 * @param opts {Object} options;
		 * @param callback {Function} callback when done
		 * @param context {Object} optional callback context
		 * @return {THREE.Group} the object;
		 */
		addVolume : function (file, opts, callback, context) {
			if (typeof(opts) === "function") {
				context = callback;
				callback = opts;
				opts = {};
			}

			var error;
			function cb() {
				if (typeof(callback) === "function") {
					callback.call(context, error);
				}
			}

			var group = new THREE.Group();
			this.addMesh(group, {branch : true, label : file});
			async.eachSeries([0, 1, 2], function (orientation, callback) {
				var slice = new desk.VolumeSlice(file, orientation,
					{sliceWith : opts.sliceWith}, function (err) {
						error = err;
					if (err) {
						cb();
						return;
					}
					slice.setSlice(Math.floor(slice.getNumberOfSlices() / 2));
					slice.addListenerOnce("changeImage", function () {
						var mesh = this.attachVolumeSlice(slice, {parent : group});
						group.add(mesh);
						callback();
					}, this);
				}.bind(this));
			}.bind(this), cb);
			return group;
		},

		/**
		 * Adds drop support
		 */
		__addDropSupport : function () {
			this.setDroppable(true);
			this.addListener("drop", function(e) {
				if (e.supportsType("fileBrowser")) {
					e.getData("fileBrowser").getSelectedFiles().
						forEach(function (file) {this.addFile(file);}, this);
				} else if (e.supportsType("volumeSlices")) {
					this.attachVolumeSlices(e.getData("volumeSlices"));
				}
			}, this);
		},

		/**
		 * fired whenever a button is clicked
		 * @param event {qx.event.type.Event} the event
		 */
		__onMouseDown : function (event) {
			if (event.getTarget() != this.getCanvas()) return;
			this.capture();
			if (this.isPickMode()) {
				var mesh = this.__pickMeshes(this.getMeshes());
				if (mesh !== Infinity) {
					this.fireDataEvent("pick", mesh);
					return;
				}
			}
			var origin = this.getContentLocation();
			var button = 0;
			if (event.isRightPressed() || 
				(event.isCtrlPressed() && !event.isShiftPressed())) {
				button = 1;
			}
			else if ( event.isMiddlePressed() ||
				(event.isShiftPressed() && !event.isCtrlPressed())) {
				button = 2;
			}
			else if (event.isCtrlPressed() && event.isShiftPressed()) {
				button = 3;
			}

			this.getControls().mouseDown(button,
				event.getDocumentLeft() - origin.left,
				event.getDocumentTop() - origin.top);
		},

        __x : null,

        __y : null,

		/**
		 * fired whenever the mouse is moved
		 * @param event {qx.event.type.Event} the event
		 */
		__onMouseMove : function (event) {
			this.__x = event.getDocumentLeft();
			this.__y = event.getDocumentTop();

			if (!this.isCapturing()) {
				return;
			}
			if (this.isPickMode()) {
				var mesh = this.__pickMeshes(this.getMeshes());
				if (mesh !== Infinity) {
					this.fireDataEvent("pick", mesh);
					return;
				}
			}
			var origin = this.getContentLocation();
			this.getControls().mouseMove(event.getDocumentLeft() - origin.left,
				event.getDocumentTop() - origin.top);
			this.render();
			this.__propagateLinks();
		},

		/**
		 * fired whenever a button is released
		 * @param event {qx.event.type.Event} the event
		 */
		__onMouseUp : function (event) {
			this.releaseCapture();
			this.getControls().mouseUp();
		},

		/**
		 * computes the intersection between an array of objects and the mouse pointer
		 * @param meshes {Array} array of THREE objects
		 * @return {Object} the (possibly empty) intersection
		 */
		__pickMeshes : function (meshes) {
			meshes = _.filter(meshes, function (mesh) {
				return mesh.visible;
			});
			
			var origin = this.getContentLocation();
			var x = this.__x - origin.left;
			var y = this.__y - origin.top;

			var elementSize = this.getInnerSize();
			var x2 = ( x / elementSize.width ) * 2 - 1;
			var y2 = - ( y / elementSize.height ) * 2 + 1;

			var vector = new THREE.Vector3().set( x2, y2, 0.5 );
			var camera = this.getCamera();
			vector.unproject(camera);

			var ray = new THREE.Raycaster(camera.position,
				vector.sub(camera.position).normalize());

			var intersection =  ray.intersectObjects(meshes);
			return _.min(intersection, function (inter) {
				return inter.distance;
			});
		},

		/**
		 * fired whenever the mouse wheel is turned
		 * @param event {qx.event.type.MouseWheel} the event
		 */
		__onMouseWheel : function (event) {
			if (event.getTarget() != this.getCanvas()) return;
			var slices = [];
			this.getScene().traverse(function (mesh) {
				if (mesh.userData && mesh.userData.viewerProperties
					&& mesh.userData.viewerProperties.volumeSlice) {
					slices.push(mesh);
				}
			});
			var intersects = this.__pickMeshes(slices);
			var delta = event.getWheelDelta() > 0 ? 1 : -1;
			if (intersects != Infinity) {
				var slice = intersects.object.userData.viewerProperties.volumeSlice;
				var maximum = slice.getNumberOfSlices() - 1;
				var newValue = slice.getSlice() + delta;
				slice.setSlice(Math.max(Math.min(newValue, maximum), 0));
			} else {
				var controls = this.getControls();
				controls.mouseDown(1, 0, 0);
				controls.mouseMove(0, 0.05 * delta * this.getInnerSize().height);
				controls.mouseUp();
				this.render();
				this.__propagateLinks();
			}
		},

		/**
		 * loads an url
		 * @param opts {Object} options
		 * @param callback {Function} callback when done
		 */
		loadURL : function (opts, callback) {
			this.__queue.push(opts, callback || function () {});
		},

		/**
		 * adds a geometry to the scene
		 * @param geometry {THREE.Geometry} the input geometry
		 * @param opts {Object} options
		 * @return {THREE.Mesh} the mesh containing the geometry
		 */
        addGeometry : function (geometry, opts) {
            opts = opts || {label : 'geometry'};
			geometry.computeBoundingBox();

			var color = opts.color || [1, 1, 1, 1];
 
			if (typeof opts.opacity !== "undefined") {
				color[3] = opts.opacity;
			}

			var col = new THREE.Color(color[0], color[1], color[2]);

			var material =  new THREE.MeshPhongMaterial({
				color : col.getHex(), opacity : color[3]});
			material.ambient = new THREE.Color().copy(col).multiplyScalar(0.3);
			material.shininess = 5;
			material.specular = new THREE.Color( 0x303030 );
			if (color[3] < 0.999) {
				material.transparent = true;
			}
			material.side = THREE.DoubleSide;

			var mesh = new THREE.Mesh(geometry, material );
			if (geometry.attributes && geometry.attributes.color) {
				mesh.material.vertexColors = THREE.VertexColors;
			}
			mesh.renderDepth = opts.renderDepth || 0
            this.addMesh( mesh, opts );
            return mesh;
        },

		__ctmWorkers : [],

		/**
		 * (really) loads an url
		 * @param opts {Object} options
		 * @param callback {Function} callback when done
		 */
		 __urlLoad : function (opts, callback) {
			if (desk.FileSystem.getFileExtension(opts.url) === "vtk") {
				this.__vtkLoader.load (opts.url + "?nocache=" + opts.mtime,
					function (geometry) {
						callback (this.addGeometry(geometry, opts));
				}.bind(this));
			} else {
				if (this.__ctmWorkers.length) {
					var worker = this.__ctmWorkers[0];
					this.__ctmWorkers.shift();
				} else {
					worker = this.__ctmLoader.createWorker();
				}

				this.__ctmLoader.load (opts.url + "?nocache=" + opts.mtime, function (geometry) {
					this.__ctmWorkers.push(worker);
					callback (this.addGeometry(geometry, opts));
				}.bind(this), {useWorker : true, worker : worker});
			}
		},

		/**
		 * creates the snapshot button
		 * @return {qx.ui.form.Button} the button
		 */
		__getSnapshotButton : function () {
			var factor = 1;
			var menu = new qx.ui.menu.Menu();
			[1, 2, 3, 4].forEach(function (f) {
				var button = new qx.ui.menu.Button("x" + f);
				button.addListener("execute", function (){
					factor = f;
				},this);
				menu.add(button);
			});

			var button = new qx.ui.form.Button(null, "desk/camera-photo.png");
			button.addListener("click", function(e) {
				this.snapshot(factor);
			}, this);

			button.setContextMenu(menu);
			qx.util.DisposeUtil.disposeTriggeredBy(menu, this);
			return button;
		},

		/**
		 * creates the reset view button
		 * @return {qx.ui.form.Button} the button
		 */
		__getResetViewButton : function () {
			var button = new qx.ui.form.Button("reset view");
			button.addListener("click", this.resetView, this);
			return button;
		},

		/**
		 * creates the save view button
		 * @return {qx.ui.form.Button} the button
		 */
		__getSaveViewButton : function () {
			var button = new qx.ui.form.Button("save view");
			button.addListener("click", function () {
				var file = prompt("Enter file name to save camera view point", "data/viewpoint.json")
				if (!file) {return;}
				button.setEnabled(false);
				desk.FileSystem.writeFile(file,
					JSON.stringify({viewpoint : this.getControls().getState()}), 
					function () {
						button.setEnabled(true);
				});
			}, this);
			return button;
		},

		/**
		 * creates the camera button
		 * @return {qx.ui.form.Button} the button
		 */
		__getCameraPropertiesButton : function () {
			var button = new qx.ui.form.MenuButton(null, "icon/16/categories/system.png");
			button.addListener("execute", function () {
				var win = new qx.ui.window.Window();
				win.setLayout(new qx.ui.layout.VBox());
				["near", "far"].forEach(function (field) {
					var container = new qx.ui.container.Composite(new qx.ui.layout.HBox());
					container.add(new qx.ui.basic.Label(field));
					var form = new qx.ui.form.TextField(this.getCamera()[field].toString());
					container.add(form);
					win.add(container);
					form.addListener("changeValue", function () {
						this.getCamera()[field] = parseFloat(form.getValue());
						this.getCamera().updateProjectionMatrix();
						this.render();
					}, this);
				}, this);
				win.open();
				win.center();
				win.addListener('close', function () {
					win.destroy();
				});
			}, this);
			return button;
		},

		/**
		 * creates the drag label
		 * @return {qx.ui.basic.Label} the label
		 */
		__getDragLabel : function () {
			var label = new qx.ui.basic.Label("Link").set({
                decorator: "button-box", width : 30, height : 30});
			// drag and drop support
			label.setDraggable(true);
			label.addListener("dragstart", function(e) {
				e.addAction("alias");
				e.addType("meshView");
				});

			label.addListener("droprequest", function(e) {
					var type = e.getCurrentType();
					if (type === "meshView") {
						e.addData(type, this);
					}
				}, this);

			// enable linking between viewers by drag and drop
			this.setDroppable(true);
			this.addListener("drop", function(e) {
				if (!e.supportsType("meshView")) {return}
				var meshView = e.getData("meshView");
				this.link(meshView);
				meshView.__propagateLinks();
			},this);

			var menu = new qx.ui.menu.Menu();

			var unlinkButton = new qx.ui.menu.Button("unlink");
			unlinkButton.addListener("execute", this.unlink, this);
			menu.add(unlinkButton);
			label.setContextMenu(menu);
			qx.util.DisposeUtil.disposeTriggeredBy(menu, this);
			return label;
		},

		/**
		 * creates mesh properties edition container
		 * @param parentWindow {qx.ui.window.Window} optional parent window
		 * @return {qx.ui.container.Composite} the container
		 */
		__getPropertyWidget : function (parentWindow){		
			var mainContainer = new qx.ui.container.Composite();
			mainContainer.setLayout(new qx.ui.layout.VBox());

			var topBox = new qx.ui.container.Composite();
			topBox.setLayout(new qx.ui.layout.HBox());
			var bottomBox = new qx.ui.container.Composite();
			bottomBox.setLayout(new qx.ui.layout.HBox());
			mainContainer.add(topBox);
			mainContainer.add(bottomBox);

			var colorSelector = new qx.ui.control.ColorSelector();
			bottomBox.add(colorSelector);//, {flex:1});

			var renderDepthLabel = new qx.ui.basic.Label("Render Depth");
			topBox.add(renderDepthLabel);

			var renderDepthSpinner=new qx.ui.form.Spinner(-100, 0,100);
			topBox.add(renderDepthSpinner);

			topBox.add(new qx.ui.core.Spacer(10, 20),{flex:1});
			if (parentWindow) {
				var alwaysOnTopCheckBox = new qx.ui.form.CheckBox("this window always on top");
				alwaysOnTopCheckBox.setValue(true);
				parentWindow.setAlwaysOnTop(true);
				alwaysOnTopCheckBox.addListener('changeValue',function (e){
					parentWindow.setAlwaysOnTop(alwaysOnTopCheckBox.getValue());
					});
				topBox.add(alwaysOnTopCheckBox);
			}
			var ratio = 255;
			var opacitySlider = new qx.ui.form.Slider();
			opacitySlider.setMinimum(0);
			opacitySlider.setMaximum(ratio);
			opacitySlider.setWidth(30);
			opacitySlider.setOrientation("vertical");
			bottomBox.add(opacitySlider);

			var enableUpdate = true;
			var updateWidgets = function (event) {
				enableUpdate = false;
				var selectedNode = this.__meshes.getSelectedNodes()[0];
				if (selectedNode.type === qx.ui.treevirtual.MTreePrimitive.Type.LEAF) {
					var firstSelectedMesh = this.__getMeshFromNode(selectedNode);
					var color=firstSelectedMesh.material.color;
					if (!color) return;
					colorSelector.setRed(Math.round(ratio*color.r));
					colorSelector.setGreen(Math.round(ratio*color.g));
					colorSelector.setBlue(Math.round(ratio*color.b));
					colorSelector.setPreviousColor(Math.round(ratio*color.r),
							Math.round(ratio*color.g),Math.round(ratio*color.b));
					opacitySlider.setValue(Math.round(firstSelectedMesh.material.opacity*ratio));
                    if (firstSelectedMesh.renderDepth) {
                        renderDepthSpinner.setValue(firstSelectedMesh.renderDepth);
                    }
					enableUpdate=true;
				}
			};
			
			updateWidgets.apply(this);

			this.__meshes.addListener("changeSelection", updateWidgets, this);

			opacitySlider.addListener("changeValue", function(event){
				if (enableUpdate) {
					var opacity=opacitySlider.getValue()/ratio;
                    this.getSelectedMeshes().forEach(function (mesh){
						mesh.material.opacity=opacity;
						if (opacity<1) {
							mesh.material.transparent=true;
						} else {
							mesh.material.transparent=false;
						}
                    });
					this.render();
				}
			}, this);

			colorSelector.addListener("changeValue", function(event){
				if (enableUpdate) {
                    this.getSelectedMeshes().forEach(function (mesh){
						mesh.material.color.setRGB (colorSelector.getRed()/ratio,
									colorSelector.getGreen()/ratio,
									colorSelector.getBlue()/ratio);
					});
					this.render();
				}
			}, this);

			renderDepthSpinner.addListener("changeValue", function(event){
				if (enableUpdate) {
                    this.getSelectedMeshes().forEach(function (mesh){
                        mesh.renderDepth = renderDepthSpinner.getValue();
                    });
					this.render();
				}
			}, this);
			return mainContainer;
		},

		/**
		 * Returns an array of selected meshes in the list
		 * @return {Array} array of THREE.Mesh
		 */
        getSelectedMeshes : function () {
            var meshes = [];
            this.__meshes.getSelectedNodes().forEach(function (node) {
                var mesh = this.__getMeshFromNode(node);
                if (mesh) meshes.push(mesh);
			}, this);
            return meshes;
        },

		/**
		 * Removes all meshes in the scene
		 * @param meshes {Array} Array of meshes to remove
		 * @param dispose {Boolean} dispose mesh to avoid memory leaks (default : true)
		 */
		removeMeshes : function (meshes, dispose) {
			meshes.forEach(function (mesh) {
				this.removeMesh(mesh, dispose);
			}, this);
		},

		/**
		 * Removes a mesh from the scene
		 * @param mesh {THREE.Mesh} mesh to remove
		 * @param dispose {Boolean} dispose mesh to avoid memory leaks (default : true)
		 */
		removeMesh : function (mesh, dispose) {
			var params = mesh && mesh.userData && mesh.userData.viewerProperties;
			if (!params) {
				console.warn("Trying to remove a mesh not part of the scene");
				return;
			}

			mesh.parent.remove(mesh);

			var leaf = this.__meshes.nodeGet(params.leaf);
			if (leaf) {
				delete leaf.viewerProperties;
				this.__meshes.getDataModel().prune(leaf.nodeId, true);
			}

			delete params.mesh;
			delete mesh.userData.viewerProperties;
			this.__setData();

			this.fireDataEvent("meshRemoved", mesh);
			if (dispose === false) return;

			if (!params.keepGeometry && mesh.geometry) {
				mesh.geometry.dispose();
			}

			if (!params.keepMaterial && mesh.material) {
				if (mesh.material.map) {
					mesh.material.map.dispose();
				}
				mesh.material.dispose();
				Object.keys(mesh.material.uniforms || {}).forEach(function (key) {
					var uniform = mesh.material.uniforms[key].value;
					var disposeFunction = uniform && uniform.dispose;
					if (typeof  disposeFunction === "function") {
						uniform.dispose();
					}
				});
			}
			this._deleteMembers(mesh);
        },

		__animator : null,

		/**
		 * creates the context menu
		 * @return {qx.ui.menu.Menu} the menu
		 */
		__getContextMenu : function() {
			//context menu to edit meshes appearance
			var menu = new qx.ui.menu.Menu();

			var properties = new qx.ui.menu.Button("properties");
			properties.addListener("execute", function (){
				var node = this.__meshes.getSelectedNodes()[0];
				var mesh = this.__getMeshFromNode(node);
				console.log(mesh);
				var geometry = mesh.geometry;
				if (!geometry) return;
				
				var nV = 0, nT = 0;
				if ( geometry instanceof THREE.Geometry ) {
					nV = geometry.vertices.length;
					nT = geometry.faces.length;
				} else {
					nV = geometry.attributes.position.numItems / 3;
					if (geometry.attributes.index) {
						nT = geometry.attributes.index.array.length / 3;
					}
				}
				alert ("Mesh with " + nV + " vertices and " + nT + " triangles");
			}, this);
			menu.add(properties);

			var appearance = new qx.ui.menu.Button("appearance");
			appearance.addListener("execute", function (){
				var win = new qx.ui.window.Window();
				win.setLayout(new qx.ui.layout.HBox());
				win.add(this.__getPropertyWidget(win));
				win.open();
				win.addListener('close', function () {
					qx.util.DisposeUtil.destroyContainer(win.getChildren()[0]);
					win.destroy();
				});
			}, this);
			menu.add(appearance);

			var showButton = new qx.ui.menu.Button("show/hide");
			showButton.addListener("execute", function (){
                this.getSelectedMeshes().forEach(function (mesh) {
					mesh.visible = !mesh.visible;
                });
				this.render();
			},this);
			menu.add(showButton);

			var edgesButton = new qx.ui.menu.Button("show/hide edges");
			edgesButton.addListener("execute", function (){

				function removeEdges() {
					this.remove(this.userData.edges);
					if (this.userData.edges) {
						this.userData.edges.geometry.dispose();
					}
					this.removeEventListener("removedFromScene", removeEdges);
					delete this.userData.edges;
				}

                this.getSelectedMeshes().forEach(function (mesh) {
					var edges = mesh.userData.edges;
					if (edges) {
						removeEdges.apply(mesh)
					} else {
						edges = new THREE.WireframeHelper(mesh);
						edges.material.color.setRGB(0,0,0);
						mesh.userData.edges = edges;
						mesh.material.polygonOffset = true;
						mesh.material.polygonOffsetFactor = 1;
						mesh.material.polygonOffsetUnits = 1;
						mesh.addEventListener("removedFromScene", removeEdges);
						mesh.add(edges);
					}
				});
				this.render();
			},this);
			menu.add(edgesButton);

			var removeButton = new qx.ui.menu.Button("remove");
			removeButton.addListener("execute", function (){
				this.removeMeshes(this.getSelectedMeshes());
				this.render();		
			},this);
			menu.add(removeButton);
			
			var analysis = new qx.ui.menu.Button("Mesh Tools");
			analysis.addListener("execute", function (){
				this.__meshes.getSelectedNodes().forEach(function (mesh) {
					if (mesh.type == qx.ui.treevirtual.MTreePrimitive.Type.LEAF) {
						new desk.MeshTools({meshViewer : this,
							specMesh : (this.getMeshes())[mesh.nodeId]});
					}
				}, this);
			}, this);
			menu.add(analysis);
			
			var animate = new qx.ui.menu.Button('animate');
			animate.addListener('execute', function () {
				var nodes = this.__meshes.getSelectedNodes();
				if (!this.__animator) {
					this.__animator = new desk.Animator(this.render.bind(this), {standalone : true});
					this.__animator.addListener('close', function () {
						this.__animator = null;
					}, this);
				}

				nodes.forEach(function (node) {
					this.__animator.addObject(this.__getMeshFromNode(node), node.label);
				}, this);
			},this);
			menu.add(animate);
			
			//// hide all menu buttons but the "show" and "hide" buttons for the volumeSlices
			menu.addListener("appear", function() {
				var nodes = this.__meshes.getSelectedNodes() || [];
				var selNode = nodes[0];
				if (!selNode) {
					return;
				}

				var visibility = "visible"
				var leaf = this.__meshes.nodeGet(selNode);
				if(leaf && leaf.viewerProperties && leaf.viewerProperties.volumeSlice) {
					visibility = "excluded";
				}

				[properties, appearance, analysis, animate].forEach(function (button) {
					button.setVisibility(visibility);
				});
			}, this);

			qx.util.DisposeUtil.disposeTriggeredBy(menu, this);
			return menu;
		}
	}
});
