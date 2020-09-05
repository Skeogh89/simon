/*
simonGame object closure.
This object encapsulates the game logic, exposing necessary information about the current game state and data to the UI.

The gameState object within serves as an interface between the UI and simonGame.
The UI can set the state as necessary when a game event is waiting on user interaction.

PROPERTIES
  * states - Available states in form {stateName: intCode, ...}. 
             Alias to gameState.states. Should be treated as read-only.

METHODS
  * getRound()    - Return current round number.
  
  * getSequence() - Return entire current light sequence, as array of integers 0-3 for button indices.
  
  * getState()    - Return current state, as integer code (a value from states)
  
  * getStrict()   - Return status of strict play, as Boolean
  
  * isState(s)    - Return true if current state is s, a state code.
                    Equivalent to (simonGame.getState() == simonGame.states.someState)
                    
  * nextRound()   - Start next round. Should be called once the player has correctly input the sequence.
  
  * press(btnI)   - Should be called when the user presses a button, represented by its integer code 0-3.
                    Returns true if the press was registered, i.e. the game is in a state where a user press
                    can be responded to by the UI.
                    
  * setState(s)   - Set the current game state. Should be passed a value from simonGame.states.
  
  * start()       - Starts the game.
  
  * togglePower() - Toggle 'power' on or off, which resets game data and state appropriately.
  
  * toggleStrict() - Toggle strict play on or off. Can be called at any time.
*/

var simonGame = (function() {
  /*
  gameState closure. Any outside interaction with this object is via simonGame methods described above.
  
  PROPERTIES
    * states       - Available states in form {stateName: intCode, ...}. 
    * (each state) - Each state from 'states' is made available as a property of this object for ease of use.
                     Example: gameState.states.powerOn is equivalent to gameState.powerOn
  
  METHODS
    * getState()   - Return current state code.
    * setState(s)  - Set current state code. Should be passed a value from `states`
                     Example: ganeState.setState(gameState.powerOn)
  */
  var gameState = (function() {
    var states = {
      powerOff: 0,
      powerOn: 1,
      start: 2,
      addRandom: 3,
      comDemo: 4,
      playerSequence: 5,
      mistake: 6,
      allCorrect: 7,
      win: 8
    };

    var state = states.powerOff;

    var retObj = {
      getState: function() {
        return state;
      },
      setState: function(n) {
        console.log('set state ' + n);
        if (n >= 0 && n <= states.win) {
          state = n;
        }
      },
      states: states,
    };

    for (var s in states)
      retObj[s] = states[s];

    return retObj;
  })(); // End gameState closure

  var gs = gameState;
  var round = 0;
  var pressN = 0;
  var strict = false;
  var sequence = [];
  var MAXROUND = 20;

  /*
  STATE SETS
  comDemo
  win
  */
  function nextRound() {
    pressN = 0;

    if (round + 1 > MAXROUND) {
      gs.setState(gs.win);
    } else {
      round += 1;
      sequence.push(Math.floor(Math.random() * 3.99));
      gs.setState(gs.comDemo);
    }
  }

  /*
  Return true if press registered, false otherwise.
  Valid states for a press are powerOn and playerSequence.
  Presses are registed at powerOn state so the user can "test" the buttons, but no change is made to game data or state.
  
  STATE SETS
  mistake
  allCorrect
  */
  function press(btnI) {
    var s = gs.getState();

    if (!(s == gs.powerOn || s == gs.playerSequence)) {
      return false;
    }

    if (s != gs.playerSequence)
      return true;

    pressN += 1;

    if (btnI != sequence[pressN - 1]) {
      pressN = 0;
      gs.setState(gs.mistake);
    } else if (pressN == sequence.length) {
      gs.setState(gs.allCorrect);
    }

    return true;
  }

  // Reset game to initial state
  function reset() {
    sequence = [];
    round = 0;
    pressN = 0;
  }

  function start() {
    reset();
    nextRound();
  }

  /*
  STATE SETS
  powerOn
  powerOff
  */
  function togglePower() {
    if (gs.getState() == gs.powerOff) {
      gs.setState(gs.powerOn);
      reset();
    } else {
      gs.setState(gs.powerOff);
      strict = false;
    }
  }

  // See closure documentation above.
  return {
    getRound: function() {
      return round;
    },
    getSequence: function() {
      return sequence
    },
    getState: gs.getState,
    getStrict: function() {
      return strict;
    },
    isState: function(s) {
      return gs.getState() == s;
    },
    nextRound: nextRound,
    press: press,
    setState: gs.setState,
    start: start,
    states: gs.states,
    togglePower: togglePower,
    toggleStrict: function() {
      strict = !strict;
    },
  };
})();

/* 
simonGame Angular app closure.
Handles view/UI aspects of game.
*/
(function() {
  /************************
  * INITIALIZATION
  ************************/
  var app = angular.module('simonGame', []);
  
  var ColorButton = function(soundUrl) {
    this.lit = false;
    this.sound = new Audio(soundUrl);
    this.light = function(disableSound) {
      if (!disableSound)
        this.sound.play();
      this.lit = true;
    };
  };

  /* 
    CONFIG object.
    
    playerPressMS     - How long button remains lit when the player presses it.
    comPressMS        - How long button remains lit when the com lights it.
    comTimeoutMS      - How long between button lights when the com demos a sequence.
                        Set initially in reset()
    startComTimeoutMS - Initial setting for comTimeoutMS. Returned to when game reset.
    incrementRounds   - Round numbers at which comTimeoutMS is incremented (becomes faster)
    speedIncrement    - Time (in ms) to subtract from comTimeoutMS at rounds in incrementRounds.
  */
  var CONFIG = {
    playerPressMS: 400,
    comPressMS: 600,
    startComTimeoutMS: 1100,
    comTimeoutMS: null,
    speedIncrement: 150,
    incrementRounds: [5, 9, 13],
  };

  /************************
  * CONTROLLER
  ************************/
  app.controller('SimonController', function($timeout) {
    var ctrl = this;
    var sg = simonGame;
    var timeoutStack = [];
    
    // Sound modified from https://s3.amazonaws.com/freecodecamp/simonSound4.mp3
    var mistakeSound = new Audio('http://adamcot.com/static/audio/simon_mistake.mp3');
    
    // Sound modified from http://www.soundjay.com/switch/sounds/switch-4.mp3
    var switchSound = new Audio();
    switchSound.src = 'data:audio/mp3;base64,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';

    this.buttons = [
      new ColorButton('https://s3.amazonaws.com/freecodecamp/simonSound1.mp3'),
      new ColorButton('https://s3.amazonaws.com/freecodecamp/simonSound2.mp3'),
      new ColorButton('https://s3.amazonaws.com/freecodecamp/simonSound3.mp3'),
      new ColorButton('https://s3.amazonaws.com/freecodecamp/simonSound4.mp3'),
    ];

    /*
    Pop any timeouts (promise objects) from timeoutStack and cancel them.
    Should be called when power turned off or game reset with 'start'.
    */
    function clearTimeouts() {
      var ids = timeoutStack.length;
      for (var i = 0; i < ids; i++)
        $timeout.cancel(timeoutStack.pop());
    }

    this.getCountText = function() {
      var txt = '';
      if (this.getPowerState()) {
        txt = (sg.isState(sg.states.powerOn)) ? '--' : sg.getRound();
      }

      return txt;
    };

    function doComDemo() {
      lightSequence(sg.getSequence(), CONFIG.comPressMS, CONFIG.comTimeoutMS);
    };

    this.getPowerState = function() {
      return !sg.isState(sg.states.powerOff);
    }

    this.getStrictState = function() {
      return sg.getStrict();
    }

    /* 
    If round is in CONFIG.incrementRounds, increment comDemo speed by value in CONFIG.speedIncrement
    Should be called at the start of each round.
    */
    function incrementSpeed() {
      CONFIG.incrementRounds.map(function(r) {
        if (sg.getRound() == r) {
          CONFIG.comTimeoutMS -= CONFIG.speedIncrement;
        }
      });
    }

    /* 
    Light this.buttons[i] for `ms` miliseconds. 
    Options is an object as described below.
    
    OPTIONS
      disableSound (bool) - Light the button but don't play its sound
      nextState (int)     - After lighting the button, set game state to this value.
    */
    function lightColor(i, ms, options) {
      var btn = ctrl.buttons[i];
      options = (!options) ? {} : options;
      var nextState = options.nextState;
      btn.light(options.disableSound);

      timeout(function() {
        btn.lit = false;
        if (typeof nextState != 'undefined') {
          sg.setState(nextState);
        }
      }, ms);
    };

    /*
    Light each button index found in seq for lightMS miliseconds, with timeoutMS
    between each light. `i` is used for recursion and may be omitted by an outside caller.
    */
    function lightSequence(seq, lightMS, timeoutMS, i) {
      i = (typeof i == 'undefined') ? 0 : i;

      if (i < seq.length - 1) {
        lightColor(seq[i], lightMS);
        timeout(function() {
          lightSequence(seq, lightMS, timeoutMS, i + 1);
        }, timeoutMS);
      } else if (i == seq.length - 1) {
        lightColor(seq[i], lightMS, {
          nextState: sg.states.playerSequence
        });
      }
    }

    this.pressColor = function(i) {
      var ms = CONFIG.playerPressMS;

      if (!sg.press(i))
        return;

      switch (sg.getState()) {
        case sg.states.allCorrect:
          lightColor(i, ms);

          timeout(function() {
            sg.nextRound();
            incrementSpeed();
            if (sg.isState(sg.states.comDemo))
              doComDemo();
            else if (sg.isState(sg.states.win))
              win();
          }, 1600);
          break;
        case sg.states.mistake:
          lightColor(i, 1000, {
            disableSound: true
          });
          mistakeSound.play();

          timeout(function() {
            if (sg.getStrict()) {
              ctrl.start();
            } else {
              sg.setState(sg.states.comDemo);
              doComDemo();
            }
          }, 1500);
          break;
        default:
          lightColor(i, ms);
          break;
      }
    };

    /* Reset UI to initial state. */
    function reset() {
      clearTimeouts();
      CONFIG.comTimeoutMS = CONFIG.startComTimeoutMS;
      ctrl.buttons.map(function(btn) {
        btn.lit = false;
      });
    }

    this.start = function() {
      if (ctrl.getPowerState()) {
        reset();
        sg.start();
        doComDemo();
      }
    };

    /*
    Calls $timeout(func, ms) and pushes resulting promise object to timeoutStack.
    */
    function timeout(func, ms) {
      timeoutStack.push($timeout(func, ms));
    }

    this.togglePower = function() {
      switchSound.play();
      sg.togglePower();
      reset();
    };

    this.toggleStrict = function() {
      if (ctrl.getPowerState())
        sg.toggleStrict();
    }

    /* 
    Play custom light sequence twice, then reset game. 
    `second` used for recursion. Outside callers should omit it.
    */
    function win(second) {
      var buttons = ctrl.buttons;

      buttons[1].light();

      timeout(function() {
        buttons[2].light();
      }, 100);

      timeout(function() {
        buttons[3].light();
      }, 225);

      timeout(function() {
        buttons[0].light();
      }, 450);

      timeout(function() {
        buttons.map(function(btn) {
          btn.lit = false;
        })
      }, 1000);
      
      if (!second)
        timeout(function() { win(true); }, 2000);
      else
        timeout(ctrl.start, 2000);
    }
  });
})();