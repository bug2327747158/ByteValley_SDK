"""
快速排序算法 - 简洁高效的实现
时间复杂度: O(n log n) 平均, O(n²) 最坏
空间复杂度: O(log n)
"""

def quick_sort(arr):
    """
    快速排序 - 使用列表推导式的简洁实现
    """
    if len(arr) <= 1:
        return arr
    
    pivot = arr[len(arr) // 2]  # 选择中间元素作为基准
    
    # 三路划分: 小于、等于、大于基准值
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    
    return quick_sort(left) + middle + quick_sort(right)


def quick_sort_inplace(arr, low=0, high=None):
    """
    快速排序 - 原地排序版本（更节省内存）
    """
    if high is None:
        high = len(arr) - 1
    
    if low < high:
        # 分区并获取基准点位置
        pivot_idx = partition(arr, low, high)
        
        # 递归排序左右两部分
        quick_sort_inplace(arr, low, pivot_idx - 1)
        quick_sort_inplace(arr, pivot_idx + 1, high)
    
    return arr


def partition(arr, low, high):
    """
    分区函数 - Lomuto 分区方案
    """
    pivot = arr[high]  # 选择最后一个元素作为基准
    i = low - 1  # i 是小于基准的元素的边界
    
    for j in range(low, high):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    
    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1


if __name__ == "__main__":
    # 测试代码
    test_arrays = [
        [64, 34, 25, 12, 22, 11, 90],
        [5, 2, 8, 1, 9, 3, 7],
        [1],
        [],
        [3, 3, 3, 3],
        [9, -3, 5, -2, 8, -6, 1]
    ]
    
    print("=" * 50)
    print("快速排序测试")
    print("=" * 50)
    
    for arr in test_arrays:
        # 测试列表推导式版本
        arr_copy1 = arr.copy()
        sorted1 = quick_sort(arr_copy1)
        
        # 测试原地排序版本
        arr_copy2 = arr.copy()
        quick_sort_inplace(arr_copy2)
        
        print(f"\n原数组: {arr}")
        print(f"排序结果: {sorted1}")
        print(f"原地排序: {arr_copy2}")
        print(f"结果一致: {sorted1 == arr_copy2}")
    
    print("\n" + "=" * 50)
    
    # 性能测试
    import random
    import time
    
    sizes = [1000, 10000, 100000]
    print("\n性能测试:")
    print("-" * 50)
    
    for size in sizes:
        arr = [random.randint(1, 1000000) for _ in range(size)]
        
        start = time.time()
        quick_sort(arr)
        elapsed = time.time() - start
        
        print(f"数组大小 {size:7d}: 耗时 {elapsed:.4f} 秒")
