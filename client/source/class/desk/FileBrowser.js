/**
 * A file browser, with customizable launch options
 * 
 * @ignore (async.each)
 * @lint ignoreDeprecated (alert)
 * @lint ignoreDeprecated (confirm)
 * @asset(desk/tris.png)
 * @asset(desk/img.png)
 * @ignore (_.*)
*/

qx.Class.define("desk.FileBrowser", 
{
	extend : qx.ui.container.Composite,
	/**
	* Creates a new file browser
	* @param baseDir {String} directory to browse. Defaluts to "data"
	* @param standAlone {bool} defines whether the container should be
	* embedded in a window or not (default : false).
	* 
	*/
	construct : function(baseDir, standAlone) {
		qx.Class.include(qx.ui.treevirtual.TreeVirtual, qx.ui.treevirtual.MNode);
		baseDir = baseDir || "data";
		if(baseDir.substr(-1) === '/') {
			baseDir = baseDir.substr(0, baseDir.length - 1);
		}

		this.base(arguments);
		this.__fileBrowsers.push(this);

		this.setLayout(new qx.ui.layout.VBox(8));
		this.__standAlone = standAlone || false;

		this.__actionCallbacks = [];
		this.__actionNames = [];

		this.__files = new qx.ui.treevirtual.TreeVirtual(
			["files","mTime","size"],
			{initiallyHiddenColumns : [1, 2]}
		).set({
			useTreeLines : false,
			rowHeight: 22,
			alwaysShowOpenCloseSymbol : true,
			columnVisibilityButtonVisible : true,
			draggable : true,
			statusBarVisible : false,
			selectionMode : qx.ui.treevirtual.TreeVirtual.SelectionMode.MULTIPLE_INTERVAL
		});

		this.addListener("mousedown", function () {
			this.__focusedRow = this.__files.getFocusedRow();
		}, this);
		
        if (this.__standAlone) {
            this.add(this.__getShortcutsContainer());
        }

		this.add(this.__files, {flex: 1});
		this.__createFilter();

		// add root directory
		this.updateRoot(baseDir);

		this.setFileHandler(this.__defaultFileHandler);
		desk.Actions.init(this.__createDefaultStaticActions, this);

		this.__files.addListener("cellDbltap", this.__onCellDbltap, this);
		this.__files.addListener("treeOpenWhileEmpty", this.__onTreeOpen, this);
		this.__files.addListener("treeOpenWithContent", this.__onTreeOpen, this);
		this.__files.addListener("dragstart", this.__onDragstart);
		this.__files.addListener("droprequest", this.__onDropRequest, this);
		this.__files.setDroppable(true);
		this.__files.addListener('drop', this.__onDrop, this);

		if (this.__standAlone) {
			var win = this.__window = new qx.ui.window.Window();
			win.set({ShowMinimize : false,
				layout : new qx.ui.layout.VBox(),
				caption : this.__baseDir,
				width : 400,
				height : 500
			});
			win.add(this, {flex : 1});
			win.addListener('close', function () {
				this.destroy();
				win.destroy();
			}, this);
			win.open();
		}
	},

	destruct : function() {
		if (this.__standAlone) {
			this.__window.destroy();
		}
		this.__files.getDataModel().dispose();
		this.__files.dispose();
		qx.util.DisposeUtil.destroyContainer(this);
		var browsers = this.__fileBrowsers;
		for (var i = 0; i < browsers.length; i++) {
			if (browsers[i] === this) {
				browsers.splice(i, 1);
				return;
			}
		}
	},

	members : {
		__focusedRow : null,

		__createFilter : function () {
			// create the filter bar
			var filterBox = new qx.ui.container.Composite();
			filterBox.setLayout(new qx.ui.layout.HBox(10));
			var dataModel = this.__files.getDataModel();

			var filterText = new qx.ui.basic.Label("Filter files :");
			filterBox.add(filterText);
			var filterField = new qx.ui.form.TextField();
			filterField.setValue("");
			filterField.addListener("input", function() {
				dataModel.setData();
			},this);
			filterBox.add(filterField, {flex:1});
			this.__filterField = filterField;

			var resetButton = new qx.ui.form.Button("Reset filter");
			resetButton.setAllowGrowY(false);
			resetButton.addListener("execute",function(e){
				filterField.setValue("");
				dataModel.setData();
			});

			filterBox.add(resetButton);
			dataModel.setFilter(function(node) {
				if (this.__isNodeLeaf(node)) {
					var label = node.label;
					return label.toLowerCase().indexOf(filterField.getValue().toLowerCase()) != -1;
				}
				return true;
			}.bind(this));
			if(this.__standAlone) {
				this.add(filterBox);
			}
		},

		__onCellDbltap :  function (e) {
			var node = this.__files.getDataModel().getNodeFromRow(e.getRow());
			this.__openNode(node);
		},

		__onTreeOpen : function (e) {
			// maybe there's a bug in qooxdoo : this event is triggered for any node (leaf or branch)
			var node = e.getData();
			if (this.__isNodeLeaf(node)) {
				return;
			}
			this.__expandDirectoryListing(node.nodeId);
		},

		__onDragstart : function(e) {
			e.addAction("move");
			e.addType("fileBrowser");
			e.addType("file");
		},

		__onDropRequest : function(e) {
			var type = e.getCurrentType();
			switch (type) {
			case "file":
				e.addData(type, this.__getNodeFile(
					this.__files.getDataModel().getNodeFromRow(this.__focusedRow)));
				break;
			case "fileBrowser":
				e.addData(type, this);
				break;
			default :
				break;
			}
		},

		__onDrop : function (e) {
			if (!e.supportsType('fileBrowser')) {
				return;
			}

			var browser = e.getData('fileBrowser');
			var files = browser.getSelectedFiles();
			var node = this.__files.getDataModel().getNodeFromRow(this.__files.getFocusedRow());

			var nodeId = this.__isNodeLeaf(node) ? node.parentNodeId : node.nodeId;
			var destination = this.__getNodeFile(nodeId);

			var actionType = prompt('Copy or move? \n0 : copy,  1 : move', '0');
			actionType = actionType === '1' ? 'move' : 'copy'

			if (!confirm ('Are you sure you want to ' + actionType + ' move these files:\n' +
					files.join('\n') + 'to :\n' + destination)) return;

			async.each(files, function (file, callback) {
				desk.Actions.getInstance().launchAction({
						action : actionType,
						source : file,
						destination : destination},
					function () {
						callback(null);
					});
				}, function (err) {
					var directories = files.map(function (file) {
						return browser.__getFileDirectory(file);
					});
					directories.push(destination);
					this.__updateDirectories(directories);
			}.bind(this));
		},

		// array to store all file browsers, usefull for updates
		__fileBrowsers : [],

		// defines whether the file browser is a standalone one
		// i.e. whether it needs to create a window
		__standAlone : false,

		// the window containing the widget when in standalone mode
		__window : null,
		__fileHandler : null,
		__baseDir : null,
		__files : null,
		__rootId : null,
		__filterField : null,

		__actionNames : null,
		__actionCallbacks : null,

        __getShortcutsContainer : function() {
            var container = new qx.ui.container.Composite();
            container.setLayout(new qx.ui.layout.HBox(5));
            var settings = desk.Actions.getInstance().getSettings();
            var dataDirs = settings.dataDirs;
            var permissions = settings.permissions;
            var dirs = Object.keys(dataDirs);
            dirs.sort();
            dirs.forEach(function (dir) {
                if ((dir === "cache") || 
					((permissions === 0) && (dir ==="actions"))) {
					return;
				}

                var button = new qx.ui.form.Button(dir);
                button.addListener("click", function () {
					this.updateRoot(dir);
				}, this);
                container.add(button, {flex : 1});
                var menu = new qx.ui.menu.Menu();
                var openButton = new qx.ui.menu.Button('open in new window');
                openButton.addListener('execute', function (e) {
					var browser = new desk.FileBrowser(dir, true);
					browser.getWindow().center();
				})
				menu.add(openButton);
				button.setContextMenu(menu);
            }, this);
            return container;
		},

		/** Returns the window containing the container in standalone mode
		* @return {qx.ui.window.Window} the file browser window
		*/
		getWindow : function() {
			return this.__window;
		},

		/**
		* Returns the field used to filter files
		* @return {qx.ui.form.TextField} the filter field
		*/
		getFileFilter : function() {
			return this.__filterField;
		},
		
		/**
		* returns the directory for the given file, session type and Id
		* @param file {String} file
		* @param sessionType {String} type of session
		* @param sessionId {Int} Id for the session
		* @return {String} session directory
		*/
		getSessionDirectory : function (file,sessionType,sessionId) {
			return file + "." + sessionType + "."+sessionId;
		},

		/**
		* Updates/changes the root
		* @param newRoot {String} new root
		*/
		updateRoot : function (newRoot) {
            if (newRoot) {
                this.__baseDir = newRoot;
                var dataModel = this.__files.getDataModel();
                dataModel.clearData();
                this.__rootId = dataModel.addBranch(null, this.__baseDir, true);
                if (this.__window) {
                    this.__window.setCaption(newRoot);
                }
            }
			this.__expandDirectoryListing(this.__rootId);
		},

		__isNodeLeaf : function (node) {
			return node.type === qx.ui.treevirtual.MTreePrimitive.Type.LEAF;
		},

		__defaultFileHandler : function (file) {
			var extension = desk.FileSystem.getFileExtension(file);
			switch (extension)
			{
			case 'js':
				if (desk.Actions.getInstance().getSettings().permissions) {
					desk.FileSystem.executeScript(file);
				} else {
					new desk.TextEditor (file);
				}
				break;
			case 'log':
			case 'txt':
			case 'cpp':
			case 'cxx':
			case 'h':
				new desk.TextEditor (file);
				break;
			case "vtk":
			case "ply":
			case "obj":
			case "stl":
			case "ctm":
			case "off":
				new desk.MeshViewer(file);
				break;
			case "xml":
				desk.FileSystem.readFile(file, function (error, xmlDoc) {
					if (xmlDoc.getElementsByTagName("mesh").length !== 0) {
						new desk.MeshViewer(file);
					} else {
						alert ('xml file of unknown type!');
					}
				});
				break;
			case "png":
			case "jpg":
			case "bmp":
			case "mhd":
				new desk.VolumeViewer(file);
				break;
			case "vol": 
				if (desk.Actions.getInstance().getAction("vol_slice") != null) {
					new desk.VolumeViewer(file);
				} else {
					console.log("vol_slice action does not exist. Skipping this filetype handler.")
				}
				break;
			case "json":
				desk.Action.CREATEFROMFILE(file);
				break;
			default:
				alert("no file handler exists for extension "+extension);
				break;
			}				
		},

		__sliceViewSimpleAction : function (node) {
			if (this.__isNodeLeaf(node)) {
				new desk.SliceViewSimple(this.__getNodeFile(node));
			} else {
				alert("Cannot view a directory!");
			}
		},

		__dicomSimpleSliceViewAction : function (node) {
			if (!this.__isNodeLeaf(node)) {
				new desk.DicomSimpleSliceView(this.__getNodeFile(node));
			} else {
				alert("Can just view a directory!");
			}
		},

		__volViewSimpleAction : function (node) {
			if (this.__isNodeLeaf(node)) {
				new desk.VolViewSimple(this.__getNodeFile(node));
			} else {
				alert("Cannot view a directory!");
			}
		},

		__downloadAction : function (node) {
			if (this.__isNodeLeaf(node)) {
				var iframe = qx.bom.Iframe.create({
					name : "testFrame" + Math.random(),
					src : desk.FileSystem.getActionURL('download') +
						'?file=' + this.__getNodeFile(node)
				});

				qx.bom.Element.addListener(iframe, "load", function(e) {
					iframe.dispose();
				});

				document.body.appendChild(iframe);
			} else {
				alert("Cannot download a directory!");
			}
		},

		__uploadAction : function (node) {
			var nodeId = node.nodeId;
			if (this.__isNodeLeaf(node)) {
				nodeId = node.parentNodeId;
			}
			var uploader = new desk.Uploader(this.__getNodeFile(nodeId));
			uploader.addListener("upload",
				_.throttle(function () {
					this.__expandDirectoryListing(nodeId);
				}.bind(this), 2000)
			);
		},

		__newDirectoryAction : function (node) {
			var nodeId = node.nodeId;
			if (this.__isNodeLeaf(node)) {
				nodeId = node.parentNodeId;
			}
			var dir = prompt('Name of the directory to create','new_dir');
			if (!dir) return;
			desk.Actions.getInstance().launchAction({
				"action" : "create_directory",
				"directory" : this.__getNodeFile(nodeId) + '/' + dir},
				function () {
					this.__expandDirectoryListing(nodeId);
			}, this);
		},

		__deleteAction : function (node) {
			var nodes = this.__getSelectedNodes();
			var message = 'Are you shure you want to delete those files/directories? \n';
			var files = nodes.map(function (node) {
				var file = this.__getNodeFile(node);
				message +=  file + '\n';
				return this.__getFileDirectory(file);
			}, this);
			if (!confirm(message)) return;

			async.each(nodes, function (node, callback) {
				var file = this.__getNodeFile(node.nodeId);
				if (this.__isNodeLeaf(node)) {
					desk.Actions.getInstance().launchAction({
						action : 'delete_file',
						file_name : file},
						function () {
							callback(null);
					});
				} else {
					desk.Actions.getInstance().launchAction({
						action : 'delete_directory',
						directory : file},
						function () {
							callback(null);
					});
				}
			}.bind(this), function (err) {
				this.__updateDirectories(files);
				this.__files.resetSelection();
			}.bind(this));
		},

		__renameAction : function (node) {
			var file = this.__getNodeFile(node.nodeId);
			var newFile = prompt('enter new file name : ', desk.FileSystem.getFileName(file));
			if (newFile !== null) {
				newFile = desk.FileSystem.getFileDirectory(file) + newFile;
				desk.Actions.getInstance().launchAction({
						action : "move",
						source : file,
						destination : newFile
					},
					function () {
						this.__expandDirectoryListing(node.parentNodeId);
				}, this);
			}
		},

		__newFileAction : function (node) {
			if (this.__isNodeLeaf(node)) {
				node = this.__files.nodeGet(node.parentNodeId);
			}
			var dir = this.__getNodeFile(node);
			var baseName = prompt('enter new file name : ', "newFile");
			if (baseName !== null) {
				desk.FileSystem.writeFile(dir + '/' + baseName, '', function () {
					this.__expandDirectoryListing(node);
				}.bind(this));
			}
		},

		__viewEditAction : function (node) {
			if (this.__isNodeLeaf(node)) {
				new desk.TextEditor(this.__getNodeFile(node));
			}
		},

		__createDefaultStaticActions : function () {
			this.__files.setContextMenuFromDataCellsOnly(true);
			var menu = new qx.ui.menu.Menu();

			// the default "open" button
			var openButton = new qx.ui.menu.Button("Open");
			openButton.addListener("execute", function (){
				this.__openNode (this.__getSelectedNodes()[0]);}, this);
			menu.add(openButton);
			menu.addSeparator();

			var actionsButton = new qx.ui.menu.Button("Actions");
			menu.add(actionsButton);
			menu.addSeparator();

			this.__files.setContextMenu(menu);
			qx.util.DisposeUtil.disposeTriggeredBy(menu, this);
			this.__files.addListener("contextmenu", function (e) {
				actionsButton.setMenu(desk.Actions.getInstance().getActionsMenu(this));
			}, this);

			if (desk.Actions.getInstance().getPermissionsLevel()<1)
				return;

			this.addAction("DicomSimpleSliceView", this.__dicomSimpleSliceViewAction, this);
			this.addAction("SliceViewSimple", this.__sliceViewSimpleAction, this);
			this.addAction("VolViewSimple", this.__volViewSimpleAction, this);
			this.addAction("download", this.__downloadAction, this);
			this.addAction("upload", this.__uploadAction, this);
			this.addAction("view/edit text", this.__viewEditAction, this);
			this.addAction("new directory", this.__newDirectoryAction, this);
			this.addAction("delete", this.__deleteAction, this);
			this.addAction('rename', this.__renameAction, this);
			this.addAction('new file', this.__newFileAction, this);
		},

		/**
		* Adds a new action in context menu
		* @param actionName {String} : label for the action
		* @param callback {Function} : callback for the action
		* @param context {Object} : optional context for the callback
		*/
		addAction : function (actionName, callback, context) {
			var location = this.__actionNames.indexOf(actionName);
			if (location == -1) {
				this.__actionNames.push(actionName);
			} else {
				console.log ('Warning : action "' + actionName + '" already exists, is overwritten!');
			}

			this.__actionCallbacks[actionName] = callback;

			var button = new qx.ui.menu.Button(actionName);
			button.setUserData("fileBrowser", this);
			button.setUserData("actionName", actionName);
			button.addListener("execute", function () {
				var buttonFileBrowser = button.getUserData("fileBrowser");
				var buttonActionName = button.getUserData("actionName");
				var node = buttonFileBrowser.__getSelectedNodes()[0] ||
					this.__files.nodeGet(this.__rootId);
				buttonFileBrowser.__actionCallbacks[buttonActionName].call(context, node);
			}, this);
			this.__files.getContextMenu().add(button);
		},

		/**
		* Changes the callback when a double click is performed
		* @param callback {Function} callback when a file is double clicked
		*/
		setFileHandler : function (callback) {
			this.__fileHandler = callback;
		},

		/**
		* Returns the qx.ui.treevirtual.TreeVirtual underneath
		* @return {qx.ui.treevirtual.TreeVirtual} the virtual tree
		*/
		getTree : function () {
			return (this.__files);
		},

		__getSelectedNodes : function () {
			return this.__files.getSelectedNodes()
		},

		/**
		* Returns an array containing currently selected files
		* @return {Array} array of files (strings)
		*/
		getSelectedFiles : function () {
			return this.__getSelectedNodes().map(function (node) {
				return this.__getNodeFile(node);
			}, this);
		},

		__getNodeMTime : function (node) {
			return (this.__files.getDataModel().getColumnData(node.nodeId, 1));
		},

		__getNodeURL : function (node) {
			return (desk.FileSystem.getFileURL(this.__getNodeFile(node)));
		},

		__getNodeFile : function (node) {
			return this.__files.getHierarchy(node).join("\/");
		},

		/**
		* Returns the base directory
		* @return {String} base directory
		*/
		getRootDir : function () {
			var baseDir = this.__baseDir + '/';
			if (baseDir.charAt(baseDir.length - 1) === '/') {
				baseDir = baseDir.substring(0, baseDir.length -1);
			}
			return baseDir;
		},

		__getFileNode : function (file) {
			var baseDir = this.getRootDir();
			if (file.indexOf(baseDir) !== 0) {
				return null;
			}
			var inFile = file.substring(baseDir.length + 1);
			var hierarchy = inFile.length ? inFile.split('/') : [];
			
			var data = this.__files.getDataModel().getData();
			if (!data) {
				console.log("__getFileNode : data=null file = " + file); 
				return null;
			}

			var node = data[this.__rootId];
			for (var i = 0; i != hierarchy.length; i++) {
				if (!_.find(node.children, function (child) {
					if (data[child].label === hierarchy[i]) {
						node = data[child];
						return true;
					}
					return false;
				})) {
					return null;
				}
			}
			return node;
		},

		/**
		* Updates a directory
		* @param file {String} directory to update
		*/
		updateDirectory : function (file) {
			this.__fileBrowsers.forEach(function (browser) {
				var nodeId = browser.__getFileNode(file);
				if (nodeId) {
					browser.__expandDirectoryListing(nodeId);
				}
			});
		},

		__getFileDirectory : function (file) {
			var node = this.__getFileNode(file);
			return node? this.__getNodeFile(node.parentNodeId) : null;
		},

		__updateDirectories : function (files) {
			_.uniq(files).forEach(this.updateDirectory, this);
		},

		__openNode : function (node) {
			if (this.__isNodeLeaf(node)) {
				if (this.__fileHandler) {
					this.__fileHandler(this.__getNodeFile(node));
				}
			} else {
				this.__files.nodeToggleOpened(node);
			}
		},

		__caseInsensitiveSort : function (a, b) {
			return a.toLowerCase().localeCompare(b.toLowerCase());
		},

		__readFileList : function (files, directory) {
			var dataModel = this.__files.getDataModel();
			var filesArray = [];
			var directoriesArray = [];
			var modificationTimes = [];
			var sizes = [];
			var node = this.__getFileNode(directory);
			if (node === null) {
				return;
			}
			var nodeId = node.nodeId;
			dataModel.prune(nodeId,false);

			files.forEach(function (file) {
				var fileName = file.name;

				if (!file.isDirectory) {
					filesArray.push(fileName);
					sizes[fileName] = file.size;
				} else {
					directoriesArray.push(fileName);
				}
				modificationTimes[fileName] = file.mtime;
			});
			directoriesArray.sort(this.__caseInsensitiveSort);
			filesArray.sort(this.__caseInsensitiveSort);

			directoriesArray.forEach(function (directory) {
				dataModel.addBranch(nodeId , directory);
			});

			filesArray.forEach(function (file) {
				var image = null;
				switch (desk.FileSystem.getFileExtension(file)) {
				case "vtk":
				case "ply":
				case "obj":
				case "stl":
					image = "desk/tris.png";
					break;
				case "mhd":
				case "jpg":
				case "png":
					image = "desk/img.png";
					break;
				default:
					break;
				}
				var newNode = dataModel.addLeaf(nodeId, file, image);
				dataModel.setColumnData(newNode, 1, modificationTimes[file]);
				dataModel.setColumnData(newNode, 2, sizes[file]);
			});
			dataModel.setData();
		},

		__expandDirectoryListing : function(nodeId) {
			var directory = this.__getNodeFile(nodeId);
			desk.FileSystem.readDir(directory, function (files) {
				this.__readFileList(files, directory);
			}, this);
		}
	}
});
