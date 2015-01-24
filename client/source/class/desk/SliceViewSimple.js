/**
/**
* @lint ignoreDeprecated(alert)
*/

qx.Class.define("desk.SliceViewSimple", 
{
  extend : qx.ui.window.Window,

  construct : function(file) {

    this.base(arguments);

    //initialize
    this.setFileName(file);

    //parse .mhd file to adjust view to the number of slides
    var mhdString = this.__readTextFile(desk.FileSystem.getFileURL(this.getFileName()));
    
    this.debug("mhdString: ", mhdString);

    this.__mhdObj = MHD.parse(mhdString);
    this.debug("mhdObj: ", this.__mhdObj);
    var numberOfSlices = this.__mhdObj.DimSize[2];

    //render first slice
    this.setSliceIndex(0);

    var pageStepValue = parseInt((numberOfSlices / 50), 10);

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
    this.setCaption(this.getFileName());
    this.setContentPadding(0);

    //init picture container and scrollbar for view instance
    this.__pictureContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox());
    this.__scrollBar = new qx.ui.core.scroll.ScrollBar("vertical");

    //set maximum of scrollbar to number of slices - 1
    this.__scrollBar.setMaximum(numberOfSlices - 1);
    this.__scrollBar.setSingleStep(1);
    this.__scrollBar.setPageStep(pageStepValue);

    //container for displaying image
    this.add(this.__pictureContainer, {row: 1, column: 0, colSpan: 2});

    // toolbar
    var toolbar = new qx.ui.toolbar.ToolBar();
    this.add(toolbar, {row: 0, column: 0, colSpan: 3});

    // reload button
    var getSliceButton = new qx.ui.toolbar.Button("Get slice");
    getSliceButton.setToolTipText("Get slice");
    getSliceButton.setHeight(15);
    getSliceButton.setPadding(0, 5, 0, 5);
    toolbar.add(getSliceButton);

    // text field for slice index
    var textarea = new qx.ui.form.TextField();
    textarea.setPlaceholder("0 - " + (numberOfSlices - 1));
    textarea.setMargin(5, 0, 5, 0);
    toolbar.add(textarea);

    //scrollbar
    this.add(this.__scrollBar, {row: 1, column: 2});

    // button click listeners 
    getSliceButton.addListener("execute", function() {
      //update scrollbar to new value
      if (this.__scrollBar.getPosition() != parseInt(textarea.getValue())) {
        this.debug("update scrollbar position to " + parseInt(textarea.getValue()));
        this.__scrollBar.setPosition(parseInt(textarea.getValue()));
      }
    }, this);

    //scrollbar listener
    this.__scrollBar.addListener("scroll", function() {
      this.fireDataEvent("get_slice", this.__scrollBar.getPosition());
    }, this);

    this.addListener("keydown", function(e) {
      console.log("Keydown: ", e.getKeyIdentifier());
      
      var old_index = this.getSliceIndex();
      
      if (e.getKeyIdentifier() == "Up") {
        if (old_index >= pageStepValue) {
          this.__scrollBar.setPosition(old_index - pageStepValue);
        } else {
          this.__scrollBar.setPosition(0);
        }
      }
      if (e.getKeyIdentifier() == "Down") {
        if (old_index <= (numberOfSlices - pageStepValue - 1)) {
          this.__scrollBar.setPosition(old_index + pageStepValue);
        } else {
          this.__scrollBar.setPosition(numberOfSlices - 1);
        }
      }
    });

    //Event listeners
    this.addListener("get_slice", function(e) {
      if (e.getData() < numberOfSlices) {
        this.debug("get slice with index " + e.getData());
        this.setSliceIndex(e.getData());
      } else {
        alert("Slice index out of range!");
      }

    }, this);

    this.open();

  },

  properties : {
    fileName : {
      init: ""
    },
    sliceIndex : { 
      init: 0,
      apply : "__applySliceIndex"
    }
  },

  members :
  {

    __pictureContainer : null,

    __scrollBar : null,

    __mhdObj : null,

    __applySliceIndex : function(value) {

      this.debug("this.__mhdObj.DimSize[0]: ", this.__mhdObj.DimSize[0]);

      desk.Actions.getInstance().launchAction({
        action : "get_simple_slide",
        input_file : this.getFileName(),
        x1 : "0",
        x2 : this.__mhdObj.DimSize[0].toString(),
        y1 : "0",
        y2 : this.__mhdObj.DimSize[1].toString(),
        z1 : this.getSliceIndex().toString(),
        z2 : this.getSliceIndex().toString()
      },
        function (response) {

          this.debug("load slide with index " + value);
          var image = new qx.ui.basic.Image(desk.FileSystem.getFileURL(response.outputDirectory + 'file.png'));
          image.setMaxWidth(500);
          image.setMaxHeight(500);

          image.addListener("loaded", function() {
            this.__pictureContainer.removeAll();
            this.__pictureContainer.add(image);
          }, this);


      }, this);

    },

    __readTextFile : function(file)
    {
        var rawFile = new XMLHttpRequest();
        var allText;
        rawFile.open("GET", file, false);
        rawFile.onreadystatechange = function ()
        {
            if(rawFile.readyState === 4)
            {
                if(rawFile.status === 200 || rawFile.status == 0)
                {
                    allText = rawFile.responseText;
                }
            }
        }
        rawFile.send(null);
        return allText;
    }

  },

  events : {
    "get_slice"   : "qx.event.type.Data"
    // "scroll" : "qx.event.type.Data"
  }

});
