<script setup>
import { ref, computed } from 'vue';
import Square from "@/Square.vue";

const winningMatrix = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

const matrix = ref([0, 0, 0, 0, 0, 0, 0, 0, 0]);
const turn = ref(1);
const status = ref(0);

const playerTurn = computed(() => { return turn.value == 1 ? 'X' : '0'; });
const statusText = computed(() => { return status.value == 1 ? 'Player X wins!' : status.value == 2 ? 'Player O wins!' : status.value == 3 ? 'Draw!' : '' });

function newGame() {
    matrix.value = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    turn.value = 1;
    status.value = 0;
}

function tickHandler(index) {
    matrix.value[index] = turn.value;

    if (checkWinning(turn.value)) {
        status.value = turn.value;
    } else if (checkDraw()){
        status.value = 3;
    } else {
        turn.value = turn.value == 1 ? 2 : 1;
    }
}

function checkWinning(playerTurn) {
    let win = false; //true = Win;

    for (let i = 0; i < winningMatrix.length; i++) {
        if (matrix.value[winningMatrix[i][0]] == playerTurn
            && matrix.value[winningMatrix[i][1]] == playerTurn
            && matrix.value[winningMatrix[i][2]] == playerTurn) {
            win = true;
            break;
        }
    }

    return win;
}

function checkDraw(){
    let draw = true;

    for(let i = 0; i < matrix.value.length; i++){
        if(matrix.value[i] == 0){
            draw = false;
            break;
        }
    }

    return draw;
}
</script>
<template>
    <div class="app h-screen flex justify-center items-center flex-col text-white gap-5">
        <h2 class="text-xl">Tic-Tac-Toe</h2>
        <h3 class="text-lg" v-show="status == 0">Player {{ playerTurn }}'s turn</h3>
        <h1 class="text-2xl">{{ statusText }}</h1>
        <button class="rounded-lg text-xl bg-blue-700 p-3" v-show="status" @click="newGame">New Game</button>
        <div class="grid grid-cols-3 grid-rows-3 border-2 border-sky-500">
            <Square v-for="i in 9" :index="i - 1" :ticked="matrix[i - 1]" :key="i" @tick="tickHandler">
            </Square>
        </div>
    </div>
</template>
