<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import {
  Chart,
  LineElement,
  PointElement,
  LineController,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'

function createDefaultOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    scales: {
      y: {
        display: false,
      },
      x: {
        display: true,
      },
    },
    plugins: {
      legend: {
        display: false,
      },
    },
  }
}

const props = defineProps({
  data: {
    type: Object,
    required: true,
  },
  options: {
    type: Object,
    default: null,
  },
})

const root = ref(null)

let chart

Chart.register(LineElement, PointElement, LineController, LinearScale, CategoryScale, Tooltip)

const chartOptions = computed(() => props.options || createDefaultOptions())

onMounted(() => {
  chart = new Chart(root.value, {
    type: 'line',
    data: props.data,
    options: chartOptions.value,
  })
})

const chartData = computed(() => props.data)

watch(chartData, (data) => {
  if (chart) {
    chart.data = data
    chart.update()
  }
})

watch(chartOptions, (options) => {
  if (chart) {
    chart.options = options
    chart.update()
  }
})
</script>

<template>
  <canvas ref="root" />
</template>
