qx.Class.define("desk.DicomSimpleSliceView",
{
  extend : qx.ui.window.Window,

  construct : function(directory) {

    this.base(arguments);

    //initialize
    this.setDirectoryName(directory);

    console.log("initial parameters: ", {"directory" : this.getDirectoryName(), "slice index" : this.getSliceIndex(), "numberOfSlices" : this.__numberOfSlices, "pageStepValue" : this.__pageStepValue, "dicomInfo" : this.getDicomInfo()});


    /**
     *  GUI implementation
     */

    //set layout for window
    var layout = new qx.ui.layout.Grid(0, 0);
    layout.setRowFlex(1, 1);
    layout.setColumnFlex(0, 1);
    this.setLayout(layout);

    //some window appearance configuration stuff
    this.setShowClose(true);
    this.setShowMinimize(true);
    this.setResizable(false,false,false,false);
    this.setUseResizeFrame(false);
    this.setUseMoveFrame(true);
    this.setContentPadding(0);

    //init picture container and scrollbar for view instance
    this.__pictureContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox());
    this.__scrollBar = new qx.ui.core.scroll.ScrollBar("vertical");

    this.__tree = new qx.ui.tree.Tree().set({
          width : 150,
          openMode : "tap",
          rootOpenClose : true
    });

    //container for displaying image
    this.add(this.__pictureContainer, {row: 1, column: 1});

    // toolbar
    var toolbar = new qx.ui.toolbar.ToolBar();
    this.add(toolbar, {row: 0, column: 0, colSpan: 4});

    // reload button
    var getSliceButton = new qx.ui.toolbar.Button("Get slice");
    getSliceButton.setToolTipText("Get slice");
    getSliceButton.setHeight(15);
    getSliceButton.setPadding(0, 5, 0, 5);
    toolbar.add(getSliceButton);

    // text field for slice index
    this.__textarea = new qx.ui.form.TextField();
    //this.__textarea.setPlaceholder("0 - " + (this.__numberOfSlices - 1));
    this.__textarea.setMargin(5, 0, 5, 0);
    toolbar.add(this.__textarea);

    //scrollbar
    this.add(this.__scrollBar, {row: 1, column: 3});



    /**
     *  Crawl directory for filenames
     */

    desk.Actions.getInstance().launchAction({
        action : "crawl_directory",
        directory : this.getDirectoryName()
        },
        function (response) {

          this.__JSONUrl = desk.FileSystem.getFileURL(response.outputDirectory + 'dicominfo.json')
          this.debug("load json with url " + response.outputDirectory + "dicominfo.json");

            //load generated JSON and allocate to dicomInfo object
            var that = this; 
            this.__readJSON(function(response) {
              // Parse JSON string into object
              that.setDicomInfo(JSON.parse(response));
              console.log("JSON loaded!");
              that.__initTree();
              that.__update();
            }, this.__JSONUrl)

      }, this);


    /**
     *  Listeners
     */

    // button click listeners 
    getSliceButton.addListener("execute", function() {
        this.setSliceIndex(parseInt(this.__textarea.getValue()));
        this.__scrollBar.setPosition(parseInt(this.__textarea.getValue()));
    }, this);

    //scrollbar listener
    this.__scrollBar.addListener("scroll", function() {
      this.setSliceIndex(this.__scrollBar.getPosition());
    }, this);

    //keylistener
    this.addListener("keydown", function(e) {
      var old_index = this.getSliceIndex();
      if (e.getKeyIdentifier() == "Up") {
        if (old_index >= this.__pageStepValue) {
          this.setSliceIndex(old_index - this.__pageStepValue);
        } else {
          this.setSliceIndex(0);
        }

      }
      if (e.getKeyIdentifier() == "Down") {
        if (old_index <= (this.__numberOfSlices - this.__pageStepValue - 1)) {
          this.setSliceIndex(old_index + this.__pageStepValue);
        } else {
          this.setSliceIndex(this.__numberOfSlices - 1);
        }
      }
      this.__scrollBar.setPosition(this.getSliceIndex());
    });

    this.open();

  },

  properties : {
    directoryName : {
      init: ""
    },
    sliceIndex : { 
      init: 0,
      apply : "__applySliceIndex"
    },
    dicomInfo : {
      init: null
    },
    studyId : {
      init: 0
    },
    seriesId : {
      init: 0
    }
  },

  members :
  {

    __pictureContainer : null,

    __scrollBar : null,

    __pageStepValue : 1,

    __numberOfSlices : 0,

    __JSONUrl : "",

    __tree : null,

    __textarea: null,

    __applySliceIndex : function(index) {

      desk.Actions.getInstance().launchAction({
        action : "dicom_2_png",
        file : this.getDicomInfo().study[this.getStudyId()].series[this.getSeriesId()].images[index]
      },
        function (response) {

          this.debug("load slide with url " + this.getDicomInfo().study[this.getStudyId()].series[this.getSeriesId()].images[index]);
          var image = new qx.ui.basic.Image(desk.FileSystem.getFileURL(response.outputDirectory + 'file.png'));

          image.addListener("loaded", function() {
            this.__pictureContainer.removeAll();
            this.__pictureContainer.add(image);
          }, this);
      }, this);
    },

    __readJSON : function(callback, url)
      {
        console.log("trying to load JSON from " + url + "....");
        var xobj = new XMLHttpRequest();
        xobj.overrideMimeType("application/json");
        xobj.open('GET', url, true); // Replace 'my_data' with the path to your file
        xobj.onreadystatechange = function () {
          if (xobj.readyState == 4 && xobj.status == "200") {
            callback(xobj.responseText);
          }
        };
        xobj.send(null); 
      },

    __initTree : function() {

        var root = new qx.ui.tree.TreeFolder("content");

        for (var i = 0; i < this.getDicomInfo().study.length; i++) {
          var study = new qx.ui.tree.TreeFolder(""+i);
          for (var j = 0; j < this.getDicomInfo().study[i].series.length; j++) {
            var series = new qx.ui.tree.TreeFile(""+j);
            study.add(series);
          }
          root.add(study);
        };

        this.__tree.setRoot(root);
        this.add(this.__tree, {row: 1, column: 0});

        this.__tree.addListener("changeSelection", function(ev) {
          /* this function is executed three times on click on a node*/
          var data = ev.getData();
          // console.log("click data: ", data[0]);

          if (data[0].__appearanceSelector != "tree-folder") {
            this.setStudyId(parseInt(data[0].$$user_parent.$$user_label));
            this.setSeriesId(parseInt(data[0].$$user_label));
            this.__update();
          }
        }, this);

    },

    __update : function() {

        console.log("update");

        //render first slice
        this.setSliceIndex(0);
        this.setCaption(this.getDirectoryName());

        console.log("study, series,", this.getStudyId(), this.getStudyId())
        this.__numberOfSlices = this.getDicomInfo().study[this.getStudyId()].series[this.getSeriesId()].images.length;
        //console.log("numberOfSlices: ", this.__numberOfSlices);

        this.__pageStepValue = (this.__numberOfSlices < 50 ? 1 : parseInt((this.__numberOfSlices / 50), 10));
        //console.log("pageStepValue: ", this.__pageStepValue);

        //set maximum of scrollbar to number of slices - 1
        this.__scrollBar.setMaximum(this.__numberOfSlices - 1);
        this.__scrollBar.setSingleStep(1);
        this.__scrollBar.setPageStep(this.__pageStepValue);

        //update picture
        this.setSliceIndex(0);
        this.__applySliceIndex(this.getSliceIndex());
        this.__scrollBar.setPosition(this.getSliceIndex());

        //update textarea
        this.__textarea.setPlaceholder("0 - " + (this.__numberOfSlices - 1));

        console.log("new parameters: ", {"current directory" : this.getDirectoryName(), "slice index" : this.getSliceIndex(), "numberOfSlices" : this.__numberOfSlices, "pageStepValue" : this.__pageStepValue, "dicomInfo" : this.getDicomInfo()});
    }
  },

  events : {

  }
});
