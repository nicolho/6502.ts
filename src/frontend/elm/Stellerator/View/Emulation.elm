{-
   This file is part of 6502.ts, an emulator for 6502 based systems built
   in Typescript

   Copyright (c) 2014 -- 2020 Christian Speckner and contributors

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
-}


module Stellerator.View.Emulation exposing (page)

import Css exposing (..)
import Css.Media as Media
import Dos
import Html.Styled exposing (..)
import Html.Styled.Attributes as A
import Html.Styled.Events as E
import Stellerator.Model
    exposing
        ( ColorSwitch(..)
        , DifficultySwitch(..)
        , EmulationState(..)
        , Model
        , Msg(..)
        , touchEnabled
        )
import Stellerator.View.Form as Form


controlHelp : Model -> List (Html msg)
controlHelp model =
    let
        item x =
            li [] [ text x ]

        keyboardHelp =
            [ h1 [] [ text "Keyboard controls" ]
            , p []
                [ ul []
                    [ item "LEFT JOYSTICK: wasd / arrows + v / space"
                    , item "RIGHT JOYSTICK: ijkl + b"
                    , item "RESET: shift-enter"
                    , item "SELECT: shift-space"
                    , item "TOGGLE FULLSCREEN: enter"
                    , item "HARD RESET: shift-r"
                    , item "PAUSE: p"
                    ]
                ]
            ]

        touchSchemeUrl =
            if model.settings.leftHanded then
                "doc/images/2600_touch_lh.jpg"

            else
                "doc/images/2600_touch.jpg"

        touchSchemeAltUrl =
            if model.settings.leftHanded then
                "doc/images/2600_touch_alt_lh.jpg"

            else
                "doc/images/2600_touch_alt.jpg"

        touchHelp =
            [ h1 [] [ text "Touch controls" ]
            , p []
                [ img
                    [ A.src touchSchemeUrl
                    , A.alt "touch controls"
                    , A.css [ display block, width (pct 100), maxWidth (Css.em 20) ]
                    ]
                    []
                , img
                    [ A.src touchSchemeAltUrl
                    , A.alt "touch controls, alt mode"
                    , A.css [ display block, marginTop (Css.em 1), width (pct 100), maxWidth (Css.em 20) ]
                    ]
                    []
                ]
            ]

        gamepadHelp =
            case model.gamepadCount of
                0 ->
                    []

                1 ->
                    [ h1 [] [ text "Gamepad controls" ]
                    , p []
                        [ ul []
                            [ item "Gamepad 1: left joystick"
                            ]
                        ]
                    ]

                _ ->
                    [ h1 [] [ text "Gamepad controls" ]
                    , p []
                        [ ul []
                            [ item "Gamepad 1: left joystick"
                            , item "Gamepad 2: right joystick"
                            ]
                        ]
                    ]
    in
    if touchEnabled model then
        touchHelp ++ gamepadHelp ++ keyboardHelp

    else
        keyboardHelp ++ gamepadHelp


console : Model -> List (Html Msg)
console model =
    let
        emulationActive =
            case model.emulationState of
                EmulationPaused ->
                    True

                EmulationRunning _ ->
                    True

                _ ->
                    False

        oneline lbl control =
            label [ A.for "nothing", A.css [ display block ] ]
                [ span [ A.css [ display inlineBlock, property "width" "calc(20 * var(--cw))" ] ] [ text lbl ]
                , control
                ]

        checkbox lbl control =
            label [ A.css [ cursor pointer ] ]
                [ span [ A.css [ display inlineBlock, property "width" "calc(20 * var(--cw))" ] ] [ text lbl ]
                , control
                ]
    in
    [ oneline "Difficulty left:" <|
        Form.radioGroup
            []
            [ ( DifficultyPro, "A/Pro:" ), ( DifficultyAmateur, "B/Amateur:" ) ]
            ChangeDifficultyP0
            model.consoleSwitches.difficultyP0
    , oneline "Difficulty right:" <|
        Form.radioGroup
            []
            [ ( DifficultyPro, "A/Pro:" ), ( DifficultyAmateur, "B/Amateur:" ) ]
            ChangeDifficultyP1
            model.consoleSwitches.difficultyP1
    , oneline "TV mode:" <|
        Form.radioGroup
            []
            [ ( ColorColor, "Color:" ), ( ColorBW, "BW:" ) ]
            ChangeColorSwitch
            model.consoleSwitches.color
    , checkbox "Limit framerate:" <| Form.checkbox ChangeLimitFramerate model.limitFramerate
    , br [] []
    , br [] []
    , button
        [ E.onClick TogglePauseEmulation
        , A.disabled <| not emulationActive
        , A.css [ property "min-width" "calc(15 * var(--cw))" ]
        ]
        [ text <|
            if model.emulationPaused then
                "Resume"

            else
                "Pause"
        ]
    , button
        [ E.onClick ResetEmulation
        , A.disabled <| not emulationActive
        , A.css [ property "min-width" "calc(15 * var(--cw))" ]
        ]
        [ text "Hard Reset" ]
    ]


emulationCanvas : Model -> Html Msg
emulationCanvas model =
    let
        visibility_ =
            case ( model.emulationState, model.showMessageOnPause ) of
                ( EmulationRunning _, _ ) ->
                    visibility visible

                ( EmulationPaused, False ) ->
                    visibility visible

                _ ->
                    visibility hidden
    in
    canvas
        [ A.id "stellerator-canvas"
        , A.css
            [ width (pct 100)
            , height (pct 100)
            , position absolute
            , left (px 0)
            , top (px 0)
            , zIndex (int 10)
            , visibility_
            , touchAction none
            ]
        ]
        []


message : Model -> Html Msg
message model =
    let
        visibility_ =
            case ( model.emulationState, model.showMessageOnPause ) of
                ( EmulationRunning _, _ ) ->
                    visibility hidden

                ( EmulationPaused, False ) ->
                    visibility hidden

                _ ->
                    visibility visible

        backgroundColor_ =
            case model.emulationState of
                EmulationError _ ->
                    Dos.backgroundColor Dos.Red

                _ ->
                    Dos.backgroundColor Dos.Green

        emulationPausedContent =
            if touchEnabled model then
                [ text "emulation paused", br [] [], text "tap to resume" ]

            else
                [ text "emulation paused" ]

        content =
            case model.emulationState of
                EmulationStopped ->
                    [ text "emulation stopped" ]

                EmulationStarting ->
                    [ text "emulation starting" ]

                EmulationPaused ->
                    emulationPausedContent

                EmulationError msg ->
                    [ text <| "ERROR: " ++ msg ]

                _ ->
                    []
    in
    div
        [ A.css
            [ height (pct 100)
            , width (pct 100)
            , displayFlex
            , justifyContent center
            , alignItems center
            , textAlign center
            , position absolute
            , left (px 0)
            , top (px 0)
            , zIndex (int 10)
            , Dos.color Dos.White
            , visibility_
            , backgroundColor_
            ]
        , E.onClick <|
            if model.emulationState == EmulationPaused && touchEnabled model then
                TogglePauseEmulation

            else
                None
        ]
        content


page : Model -> List (Html Msg)
page model =
    let
        small =
            Media.withMedia [ Media.all [ Media.maxWidth (px <| toFloat ((900 * model.settings.uiSize) // 100)) ] ]
    in
    [ div
        [ A.css
            [ width (vw 100)
            , property "height" "calc(100vh - 3em)"
            , marginTop (Css.em 1)
            , displayFlex
            , boxSizing borderBox
            , alignItems stretch
            , flexDirection row
            , small [ display block ]
            ]
        ]
        [ div
            [ Dos.panel
            , A.css
                [ displayFlex
                , alignItems stretch
                , flexGrow (int 1)
                , small [ property "height" "calc(70vh - 4em)", maxHeight (px 600) ]
                ]
            ]
            [ div
                [ A.css
                    [ flexGrow (int 1)
                    , property "padding" "1em calc(2 * var(--cw))"
                    , Dos.backgroundColor Dos.Black
                    , position relative
                    ]
                ]
                [ emulationCanvas model
                , message model
                ]
            ]
        , div
            [ A.css
                [ flexGrow (num 0)
                , flexShrink (int 0)
                , property "flex-basis" "calc(50 * var(--cw))"
                , displayFlex
                , flexDirection column
                , alignItems stretch
                ]
            ]
            [ div [ Dos.panel, Dos.panelLabel "Console:" ] <| console model
            , div
                [ Dos.panel
                , Dos.panelLabel "Help:"
                , A.css
                    [ flexGrow (int 1)
                    , overflow hidden
                    , displayFlex
                    , alignItems stretch
                    , flexDirection column
                    ]
                ]
                [ div
                    [ A.css
                        [ overflowY scroll
                        , property "-webkit-overflow-scrolling" "touch"
                        , flexGrow (int 1)
                        ]
                    ]
                  <|
                    controlHelp model
                ]
            ]
        ]
    ]
