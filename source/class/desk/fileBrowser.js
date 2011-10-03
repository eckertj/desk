qx.Class.define("desk.fileBrowser", 
{
  extend : qx.ui.window.Window,

	construct : function(container, baseDir)
	{
		this.base(arguments);
		if (baseDir!=null)
			this.__baseDir=baseDir;

		qx.Class.include(qx.ui.treevirtual.TreeVirtual,
			qx.ui.treevirtual.MNode);

		this.__actionCallbacks=[];
		this.__actionNames=[];

		var virtualTree = new qx.ui.treevirtual.TreeVirtual(["files","mTime","size"],
			{initiallyHiddenColumns : [1, 2]});
		this.__virtualTree=virtualTree;
		virtualTree.setSelectionMode(qx.ui.treevirtual.TreeVirtual.SelectionMode.MULTIPLE_INTERVAL);

		virtualTree.set({
			width  : 400,
			rowHeight: 22,
			alwaysShowOpenCloseSymbol : true,
			columnVisibilityButtonVisible : true,
			draggable : true});

		var dataModel = virtualTree.getDataModel();

		this.__actionsHandler=desk.actions.ACTIONSHANDLER;

		if (container==null)
		{
			this.setLayout(new qx.ui.layout.VBox());
			this.setShowClose(false);
			this.setShowMinimize(false);
			this.setUseMoveFrame(true);
			this.setCaption("files");
			this.setHeight(500);

			//create menu
			var menu=new qx.ui.menu.Menu;

/*			var uploadButton = new qx.ui.menu.Button("Upload");
			uploadButton.addListener("execute", function (e){alert ("Not implemented!");}, this);
			menu.add(uploadButton);
			menu.addSeparator();

			this.__actionsMenuButton=new qx.ui.menu.Button("Actions", null , null);
			menu.add(this.__actionsMenuButton);

			var actionsButton = new qx.ui.form.MenuButton("Actions", null, menu);
			this.add(actionsButton);*/

			// create the filter bar
			var filterBox = new qx.ui.container.Composite;
			filterBox.setLayout(new qx.ui.layout.HBox(10));
			this.add(filterBox);//, {flex:1});
			var filterText=new qx.ui.basic.Label("Filter files :");
			filterBox.add(filterText);
			var filterField = new qx.ui.form.TextField();
			filterField.setValue("");
			filterField.addListener("input", function() {
				dataModel.setData();
				},this);
			filterBox.add(filterField, {flex:1});

			var filter = qx.lang.Function.bind(function(node)
				{
					if (node.type == qx.ui.treevirtual.MTreePrimitive.Type.LEAF) {
						var label = node.label;
						return label.toLowerCase().indexOf(filterField.getValue().toLowerCase()) != -1;
					}
					return true;
				}, this);
			var resetButton=new qx.ui.form.Button("Reset filter");
			resetButton.setAllowGrowY(false);
			resetButton.addListener("execute",function(e){
				filterField.setValue("");
				dataModel.setData();
				});
			filterBox.add(resetButton);
			dataModel.setFilter(filter);

			this.add(virtualTree,{flex: 1});
			this.open();
		}
		else
			container.add(virtualTree, {flex : 1});

		// add root directory
		this.__rootId = dataModel.addBranch(null, this.__baseDir, true);
		this.updateRoot();

		// events handling
		this.createDefaultStaticActions();

		virtualTree.addListener("cellDblclick", function (e) {
			var node=this.getEventNode(e);
			this.openNode(node);}, this);

		virtualTree.addListener("treeOpenWhileEmpty",function (e) {
			this.expandDirectoryListing(e.getData().nodeId);}, this);
		virtualTree.addListener("treeOpenWithContent",function (e) {
			this.expandDirectoryListing(e.getData().nodeId);}, this);

		// drag and drop support
		virtualTree.addListener("dragstart", function(e) {
			e.addAction("move");
			e.addType("fileBrowser");
			e.addType("text");
			});

		virtualTree.addListener("droprequest", function(e) {
				var type = e.getCurrentType();
				switch (type)
				{
				case "text":
					e.addData(type, this.getNodeFile(this.getSelectedNode()));
					break;
				case "fileBrowser":
					e.addData(type, this);
					break;
				case "fileNode":
					e.addData(type, this.getSelectedNode());
					break;
				default :
					alert ("type "+type+"not supported for drag and drop");
				}
			}, this);

		return (this);
	},

	members : {
		__fileHandler : null,
		__baseURL : "/visu/desk/php/",
		__baseDir : "data",
		__virtualTree : null,
		__rootId : null,

		__actionNames : null,
		__actionCallbacks : null,
		__actionsHandler : null,
		__actionsMenuButton : null,

		__updateDirectoryInProgress : null,


		// creates an array containing sessions of given type (string)
		// sessions are just directories for which the name contains in order:
		// -the fileNode name
		// -the sessionType
		// -the session number
		// separated by a "."
		// the array as passed as parameter to the callback function

		getFileSessions : function (file, sessionType, callback)
		{
			var lastSlashIndex=file.lastIndexOf("/");
			var directory=file.substring(0,lastSlashIndex);
			console.log("directory : "+directory);

			var shortFileName=file.substring(lastSlashIndex+1,file.length);
			console.log("file name : "+shortFileName);
			function readFileList(e)
			{
				var sessions=[];
				var req = e.getTarget();
				var files=req.getResponseText().split("\n");
				for (var i=0;i<files.length;i++)
				{
					var splitfile=files[i].split(" ");
					var fileName=splitfile[0];
					if (fileName!="")
					{
						if (splitfile[1]=="dir")
						{
							//first, test if the directory begins like the file
							var childLabel=splitfile[0];
							var begining=childLabel.substring(0,shortFileName.length+1);
							console.log ("child label : *"+begining+"*");
							if (begining==(shortFileName+"."))
							{
								console.log ("matches");
								var remaining=childLabel.substring(shortFileName.length+1, childLabel.length);
								console.log("remaining : "+remaining);
								if (sessionType!=null)
								{
									var childSession=remaining.substring(0,sessionType.length+1);
									if (childSession==(sessionType+"."))
									{
										var sessionId=parseInt(remaining.substring(sessionType.length+1,remaining.length));
										console.log(sessionId);
										sessions.push(sessionId);
									}
								}
								else
								{
									alert("error : no session type asked");
								}
							}
						}
					}
				}
				callback(sessions);
			}

			// Instantiate request
			var req = new qx.io.request.Xhr();
			req.setUrl("/visu/desk/php/listDir.php");
			req.setMethod("POST");
			req.setAsync(true);
			req.setRequestData({"dir" : directory});
			req.addListener("success", readFileList, this);
			req.send();
		},


		// returns a newly created directory node 
		// executes callback with the new node as parameter when finished
		createNewSession : function (file, sessionType, callback)
		{
			var fileBrowser=this;
			console.log("file name : "+file);
			function success(sessions)
			{
				var maxId=-1;
				for (var i=0;i<sessions.length;i++)
				{
					var sessionId=sessions[i];
					if (sessionId>maxId)
						maxId=sessionId;
				}

				var newSessionId=maxId+1;

				function getAnswer(e)
				{
					callback(newSessionId);
				}

				var newDir=file+"."+sessionType+"."+newSessionId;

				var parameterMap={
					"action" : "Create_directory",
					"directory_name" : newDir};
				fileBrowser.getActions().launchAction(parameterMap, getAnswer);
			}

			this.getFileSessions(file, sessionType, success);
		},

		updateRoot : function ()
		{
			this.expandDirectoryListing(this.__rootId);
		},

		getActions : function ()
		{
			return this.__actionsHandler;
		},

		createDefaultStaticActions : function ()
		{
			var myBrowser=this;
			function fileClicked(node) {
				var modificationTime=myBrowser.getNodeMTime(node);
				var file=myBrowser.getNodeFile(node);
				var fileURL=myBrowser.getFileURL(file);
				var extension=file.substring(file.length-4, file.length);
				switch (extension)
				{
				case ".vtk":
					var meshView=new desk.meshView(file, myBrowser,modificationTime);
					qx.core.Init.getApplication().getRoot().add(meshView);
					break;
				case ".ply":
				case ".obj":
				case ".stl":
					var meshView=new desk.meshView(file,myBrowser);
					qx.core.Init.getApplication().getRoot().add(meshView);
					break;
				case ".png":
				case ".jpg":
				case ".bmp":
					var imageView=new desk.imageView(file, myBrowser);
					qx.core.Init.getApplication().getRoot().add(imageView);
					break;
				case ".xml":
					var xmlhttp=new XMLHttpRequest();
					xmlhttp.open("GET",fileURL+"?nocache=" +modificationTime,false);
					xmlhttp.send();
					var xmlDoc=xmlhttp.responseXML;
					
					if (xmlDoc.getElementsByTagName("mesh").length!=0)
					{
						var meshView=new desk.meshView(file, myBrowser, modificationTime);
						qx.core.Init.getApplication().getRoot().add(meshView);
					}
					else if (xmlDoc.getElementsByTagName("volume").length!=0)
					{
						var volView=new desk.volView(file, myBrowser, modificationTime);
						qx.core.Init.getApplication().getRoot().add(volView);
					}
					else
						alert ("xml file of unknown type!");
					break;
				case ".mhd":
					var volView=new desk.volView(file, myBrowser);
					qx.core.Init.getApplication().getRoot().add(volView);
					break;
				case ".par":
					myBrowser.getActions().createActionWindowFromURL(myBrowser.getNodeURL(node));
					break;
				default:
					alert("no file handler exists for extension "+extension);
				}
				
			}

			myBrowser.setFileHandler(fileClicked);

			myBrowser.addAction("redo action", function (node) {
				if (node.type==qx.ui.treevirtual.MTreePrimitive.Type.LEAF)
					myBrowser.__actionsHandler.createActionWindowFromURL(
						myBrowser.getNodeURL(node));
				else
					myBrowser.__actionsHandler.createActionWindowFromURL(
						myBrowser.getNodeURL(node)+"\/parameters.txt");});

			myBrowser.addAction("volViewSimple", function (node) {
				if (node.type==qx.ui.treevirtual.MTreePrimitive.Type.LEAF)
					var volView=new desk.volViewSimple(node, myBrowser);
				else
					alert("Cannot view a directory!");});

			myBrowser.addAction("download",function (node) {
				if (node.type==qx.ui.treevirtual.MTreePrimitive.Type.LEAF)
				{
					var oIFrm = document.getElementById('myIFrm');
					oIFrm.src = "/visu/desk/php/download.php?fileName="+myBrowser.getNodeFile(node);
				} 
				else
					alert("Cannot download a directory!");});

			myBrowser.addAction("view/edit text", function (node) {
				if (node.type==qx.ui.treevirtual.MTreePrimitive.Type.LEAF)
					var volView=new desk.textEditor(node, myBrowser);});

			myBrowser.addAction("info",function (node) {
				alert ("file name : "+myBrowser.getNodeFile(node)
					+"\n file URL : "+myBrowser.getNodeURL(node));});

			myBrowser.addAction("update",function (node) {
				if (node.type==qx.ui.treevirtual.MTreePrimitive.Type.LEAF)
					myBrowser.expandDirectoryListing(node.parentNodeId);
				else
					myBrowser.expandDirectoryListing(node.nodeId);});
		},

		addAction : function (actionName, callback)
		{
			var location=this.__actionNames.indexOf(actionName);
			if (location==-1)
			{
				this.__actionNames.push(actionName);
			}
			else
			{
				console.log ("Warning : action \""+actionName+"\" already exists, is overwritten!");
			}

			this.__actionCallbacks[actionName]=callback;
			this.updateContextMenu();
		},

		setFileHandler : function (callback) {
			this.__fileHandler=callback;
		},

		getTree : function ()
		{
			return (this.__virtualTree);
		},

		getSelectedNode : function (e)
		{
			return (this.__virtualTree.getSelectedNodes()[0]);
		},

		getSelectedNodes : function (e)
		{
			return (this.__virtualTree.getSelectedNodes());
		},

		getEventNode : function (e)
		{
			return (this.__virtualTree.getDataModel().getNodeFromRow(e.getRow()));
		},

		getNodeMTime : function (node)
		{
			return (this.__virtualTree.getDataModel().getColumnData(node.nodeId, 1));
		},

		getNodeURL : function (node)
		{
			return (this.__baseURL+this.getNodeFile(node));
		},

		getFileURL : function (file)
		{
			return (this.__baseURL+file);
		},

		getNodeFile : function (node)
		{
			var hierarchy=this.__virtualTree.getHierarchy(node);
			return (hierarchy.join("\/"));
		},

		openNode : function (node) {
			if (node.type==qx.ui.treevirtual.MTreePrimitive.Type.LEAF)
			{
				if (this.__fileHandler!=null)
						this.__fileHandler(node);
			}
			else
				this.__virtualTree.nodeToggleOpened(node);
		},

		updateContextMenu : function()
		{
			this.__virtualTree.setContextMenuFromDataCellsOnly(true);

			var menu = new qx.ui.menu.Menu;

			// the default "open" button
			var openButton = new qx.ui.menu.Button("Open");
			openButton.addListener("execute", function (){
				this.openNode (this.getSelectedNode());}, this);
			menu.add(openButton);

			menu.addSeparator();

			var actionsButton=new qx.ui.menu.Button("Actions");
			menu.add(actionsButton);
			actionsButton.addListener("click", function (e) {
				this.__actionsHandler.openActionsMenu(e, this);
					}, this);

			menu.addSeparator();
			// other actions buttons
			for (var i=0;i<this.__actionNames.length;i++)
			{
				var actionName=this.__actionNames[i];
				var button = new qx.ui.menu.Button(actionName);
				button.setUserData("fileBrowser",this);
				button.setUserData("actionName",actionName);

				button.addListener("execute", function () {
					var buttonFileBrowser=this.getUserData("fileBrowser");
					var buttonActionName=this.getUserData("actionName");
					var node=buttonFileBrowser.getSelectedNode();
					buttonFileBrowser.__actionCallbacks[buttonActionName](node);
					}, button);
				menu.add(button);
			}
			this.__virtualTree.setContextMenu(menu);
		},

		expandDirectoryListing : function(node) {
			if (this.__updateDirectoryInProgress==true)
			{
				console.log("tried to update directory while update is already in progress");
				return;
			}
			this.__updateDirectoryInProgress=true;

			var dataModel=this.__virtualTree.getDataModel();
			dataModel.prune(node,false);

			// Instantiate request
			var req = new qx.io.request.Xhr();
			req.setUrl("/visu/desk/php/listDir.php");
			req.setMethod("POST");
			req.setAsync(true);
			req.setRequestData({"dir" : this.getNodeFile(node)});
			req.addListener("success", readFileList, this);
			req.send();

			function readFileList(e)
			{
				var req = e.getTarget();
				var files=req.getResponseText().split("\n");
				var filesArray=new Array();
				var directoriesArray=new Array();
				var modificationTimes=new Array();
				var sizes=new Array();
				for (var i=0;i<files.length;i++)
				{
					var splitfile=files[i].split(" ");
					var fileName=splitfile[0];
					if (fileName!="")
					{
						if (splitfile[1]=="file")
						{
							filesArray.push(fileName);
							sizes[fileName]=parseInt(splitfile[3]);
						}
						else
							directoriesArray.push(fileName);

						modificationTimes[fileName]=parseInt(splitfile[2]);
					}
				}
				directoriesArray.sort();
				filesArray.sort();

				for (var i=0;i<directoriesArray.length;i++)
					dataModel.addBranch(node	, directoriesArray[i]);

				for (var i=0;i<filesArray.length;i++)
				{
					var newNode;
					switch (filesArray[i].substring(filesArray[i].length-4, filesArray[i].length))
					{
					case ".vtk":
					case ".ply":
					case ".obj":
					case ".stl":
						newNode=dataModel.addLeaf(node, filesArray[i],"desk/tris.png");
						break;
					case ".mhd":
					case ".jpg":
					case ".png":
						newNode=dataModel.addLeaf(node, filesArray[i],"desk/img.png");
						break;
					default:
						newNode=dataModel.addLeaf(node, filesArray[i]);
					}
					dataModel.setColumnData(newNode, 1, modificationTimes[filesArray[i]]);
					dataModel.setColumnData(newNode, 2, sizes[filesArray[i]]);
				}
				dataModel.setData();
				this.__updateDirectoryInProgress=false;
			}
		}
	}
});
