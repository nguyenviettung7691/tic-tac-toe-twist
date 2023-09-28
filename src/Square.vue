<script setup>
import { computed } from 'vue';
const props = defineProps({
    index: Number,
    ticked: Number
});

const symbol = computed(() => {
    return (props.ticked == 1) ? 'X' :
        (props.ticked == 2) ? 'O' : '';
});
const buttonClass = computed(() => {
    return ['text-5xl w-20 h-20 border border-slate-100', {'text-red-500': props.ticked == 1, 'text-blue-500': props.ticked == 2}];
});

const emit = defineEmits(['tick']);

function clickHandler() {
    emit('tick', props.index);
}
</script>
<template>
    <button :class="buttonClass" @click="clickHandler" :disabled="ticked">{{ symbol }}</button>
</template>